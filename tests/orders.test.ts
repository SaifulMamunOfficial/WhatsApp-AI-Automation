import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { mergeContacts } from "@/core/contacts/mutations";
import { assignOrder, createOrder, deleteOrder, setOrderStatus, updateOrder } from "@/core/orders/mutations";
import { agentSummary, getOrder, listOrders, openOrderCount, orderStats } from "@/core/orders/queries";
import { canAssign, canChangeStatus, computeTotal, formatOrderNumber, parseOrderInput } from "@/core/orders/rules";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: { id: string; role: "admin" };
let ria: { id: string; role: "agent" };
let sam: { id: string; role: "agent" };
let contactId: string;
let otherContactId: string;
let conversationId: string;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());

async function user(email: string, role: "admin" | "agent") {
  const [u] = await t.db.insert(schema.users).values({ email, name: email.split("@")[0], passwordHash: "x", role }).returning({ id: schema.users.id });
  return { id: u.id, role } as never;
}

beforeEach(async () => {
  await t.db.delete(schema.orders);
  await t.db.delete(schema.conversations);
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.users);
  await t.db.delete(schema.channels);
  admin = await user("admin@x.org", "admin");
  ria = await user("ria@x.org", "agent");
  sam = await user("sam@x.org", "agent");
  const [ch] = await t.db.insert(schema.channels).values({ type: "whatsapp", name: "WA", externalId: "wa1", status: "active" }).returning({ id: schema.channels.id });
  const [c] = await t.db.insert(schema.contacts).values({ name: "Karim" }).returning({ id: schema.contacts.id });
  const [c2] = await t.db.insert(schema.contacts).values({ name: "Other" }).returning({ id: schema.contacts.id });
  contactId = c.id;
  otherContactId = c2.id;
  const [ident] = await t.db.insert(schema.contactIdentities).values({ contactId, channelId: ch.id, externalId: "8801711000001" }).returning({ id: schema.contactIdentities.id });
  const [conv] = await t.db.insert(schema.conversations).values({ channelId: ch.id, contactId, identityId: ident.id }).returning({ id: schema.conversations.id });
  conversationId = conv.id;
});

const fields = (over: Record<string, unknown> = {}) => ({
  kind: "order",
  priority: "normal",
  title: "Panjabi order",
  note: "",
  deliveryName: "",
  deliveryPhone: "01711000001",
  deliveryAddress: "Mirpur 10",
  courier: "",
  trackingNumber: "",
  appointmentAt: "",
  items: [
    { name: "Navy panjabi", quantity: 2, unitPrice: 800 },
    { name: "Cap", quantity: 1, unitPrice: 200 },
  ],
  ...over,
});

async function make(over: Record<string, unknown> = {}, actor = ria as { id: string; role: "admin" | "agent" }) {
  const r = await createOrder(t.db, { contactId, conversationId, fields: fields(over) }, actor);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("rules", () => {
  it("formats order numbers", () => {
    expect(formatOrderNumber(1)).toBe("ORD-0001");
    expect(formatOrderNumber(12345)).toBe("ORD-12345");
  });

  it("computes the total from lines and ignores any total the client sends", () => {
    expect(computeTotal([{ quantity: 2, unitPrice: 800 }, { quantity: 1, unitPrice: 200 }])).toBe(1800);
    const p = parseOrderInput({ ...fields(), totalAmount: 1 });
    expect(p.ok && p.total).toBe(1800);
  });

  it("rejects bad input", () => {
    expect(parseOrderInput(fields({ title: "  " })).ok).toBe(false);
    expect(parseOrderInput(fields({ items: [{ name: "x", quantity: 0, unitPrice: 5 }] })).ok).toBe(false);
    expect(parseOrderInput(fields({ items: [{ name: "x", quantity: 1, unitPrice: -5 }] })).ok).toBe(false);
    expect(parseOrderInput(fields({ items: [{ name: "x", quantity: 1, unitPrice: 1.5 }] })).ok).toBe(false);
    expect(parseOrderInput(fields({ appointmentAt: "not a date" })).ok).toBe(false);
    expect(parseOrderInput(fields({ items: Array.from({ length: 31 }, () => ({ name: "x", quantity: 1, unitPrice: 1 })) })).ok).toBe(false);
    expect(parseOrderInput(fields({ items: [{ name: "x", quantity: 10_000, unitPrice: 10_000_000 }, { name: "y", quantity: 10_000, unitPrice: 10_000_000 }] })).ok).toBe(false);
  });

  it("treats empty text as null", () => {
    const p = parseOrderInput(fields({ note: "   ", courier: "" }));
    expect(p.ok && p.value.note).toBeNull();
    expect(p.ok && p.value.courier).toBeNull();
  });

  it("status and assignment permissions", () => {
    expect(canChangeStatus("pending", "in_progress", "agent")).toBe(true);
    expect(canChangeStatus("pending", "pending", "agent")).toBe(false);
    expect(canChangeStatus("resolved", "pending", "agent")).toBe(false);
    expect(canChangeStatus("resolved", "pending", "admin")).toBe(true);
    expect(canChangeStatus("cancelled", "resolved", "admin")).toBe(false);
    expect(canAssign({ id: "a", role: "agent" }, null, "a")).toBe(true);
    expect(canAssign({ id: "a", role: "agent" }, "b", "a")).toBe(false);
    expect(canAssign({ id: "a", role: "agent" }, "a", null)).toBe(true);
    expect(canAssign({ id: "a", role: "agent" }, "b", null)).toBe(false);
    expect(canAssign({ id: "a", role: "agent" }, null, "b")).toBe(false);
    expect(canAssign({ id: "x", role: "admin" }, "b", "c")).toBe(true);
  });
});

describe("creating", () => {
  it("creates with lines, a computed total, the creator as owner and a history entry", async () => {
    const r = await make();
    const d = await getOrder(t.db, r.id);
    expect(d?.order.number).toBe(r.number);
    expect(d?.order.totalAmount).toBe(1800);
    expect(d?.order.assignedUserId).toBe(ria.id);
    expect(d?.order.status).toBe("pending");
    expect(d?.items.map((i) => i.name)).toEqual(["Navy panjabi", "Cap"]);
    expect(d?.events.map((e) => e.type)).toEqual(["created"]);
  });

  it("numbers orders in sequence without duplicates, even when created together", async () => {
    const all = await Promise.all([make(), make(), make(), make()]);
    const numbers = all.map((a) => a.number).sort((a, b) => a - b);
    expect(new Set(numbers).size).toBe(4);
    expect(numbers[3] - numbers[0]).toBe(3);
  });

  it("refuses a missing contact or a conversation of another contact", async () => {
    const bad = await createOrder(t.db, { contactId: "00000000-0000-4000-8000-000000000000", fields: fields() }, ria);
    expect(bad.ok).toBe(false);
    const wrong = await createOrder(t.db, { contactId: otherContactId, conversationId, fields: fields() }, ria);
    expect(wrong).toEqual({ ok: false, error: "কথোপকথন এই কন্টাক্টের নয়।" });
  });

  it("an order with no lines has a zero total", async () => {
    const r = await make({ items: [], kind: "complaint", title: "Late delivery" });
    expect((await getOrder(t.db, r.id))?.order.totalAmount).toBe(0);
  });
});

describe("editing", () => {
  it("replaces the lines and recomputes the total", async () => {
    const r = await make();
    const res = await updateOrder(t.db, r.id, fields({ items: [{ name: "Shoes", quantity: 1, unitPrice: 3000 }], priority: "high" }), ria);
    expect(res.ok).toBe(true);
    const d = await getOrder(t.db, r.id);
    expect(d?.order.totalAmount).toBe(3000);
    expect(d?.order.priority).toBe("high");
    expect(d?.items).toHaveLength(1);
    expect(d?.events.map((e) => e.type)).toEqual(["created", "edited"]);
  });

  it("a finished order only accepts a note change", async () => {
    const r = await make();
    await setOrderStatus(t.db, r.id, "resolved", ria);
    const price = await updateOrder(t.db, r.id, fields({ items: [{ name: "Navy panjabi", quantity: 1, unitPrice: 1 }] }), ria);
    expect(price.ok).toBe(false);
    const note = await updateOrder(t.db, r.id, fields({ note: "Delivered, thanks" }), ria);
    expect(note.ok).toBe(true);
    const d = await getOrder(t.db, r.id);
    expect(d?.order.note).toBe("Delivered, thanks");
    expect(d?.order.totalAmount).toBe(1800);
  });
});

describe("status", () => {
  it("sets resolvedAt on finishing and clears it on reopening (admin only)", async () => {
    const r = await make();
    expect((await setOrderStatus(t.db, r.id, "in_progress", ria)).ok).toBe(true);
    expect((await setOrderStatus(t.db, r.id, "resolved", ria)).ok).toBe(true);
    expect((await getOrder(t.db, r.id))?.order.resolvedAt).not.toBeNull();
    expect((await setOrderStatus(t.db, r.id, "pending", ria)).ok).toBe(false);
    expect((await setOrderStatus(t.db, r.id, "pending", admin)).ok).toBe(true);
    const d = await getOrder(t.db, r.id);
    expect(d?.order.resolvedAt).toBeNull();
    expect(d?.events.filter((e) => e.type === "status").map((e) => `${e.fromValue}>${e.toValue}`)).toEqual(["pending>in_progress", "in_progress>resolved", "resolved>pending"]);
  });

  it("refuses an unknown order and a no-op change", async () => {
    expect((await setOrderStatus(t.db, "00000000-0000-4000-8000-000000000000", "resolved", ria)).ok).toBe(false);
    const r = await make();
    expect((await setOrderStatus(t.db, r.id, "pending", ria)).ok).toBe(false);
  });
});

describe("assigning", () => {
  it("an agent can take an unassigned order and release their own, not someone else's", async () => {
    const r = await make({}, admin);
    await t.db.update(schema.orders).set({ assignedUserId: null }).where(eq(schema.orders.id, r.id));
    expect((await assignOrder(t.db, r.id, ria.id, ria)).ok).toBe(true);
    expect((await assignOrder(t.db, r.id, sam.id, sam)).ok).toBe(false); // sam cannot steal ria's order
    expect((await assignOrder(t.db, r.id, null, sam)).ok).toBe(false);
    expect((await assignOrder(t.db, r.id, null, ria)).ok).toBe(true);
  });

  it("an admin can assign anyone active but not an inactive member", async () => {
    const r = await make();
    expect((await assignOrder(t.db, r.id, sam.id, admin)).ok).toBe(true);
    await t.db.update(schema.users).set({ active: false }).where(eq(schema.users.id, ria.id));
    expect((await assignOrder(t.db, r.id, ria.id, admin)).ok).toBe(false);
  });
});

describe("deleting", () => {
  it("only an admin may delete, and only a cancelled order", async () => {
    const r = await make();
    expect((await deleteOrder(t.db, r.id, admin)).ok).toBe(false); // still pending
    await setOrderStatus(t.db, r.id, "cancelled", ria);
    expect((await deleteOrder(t.db, r.id, ria)).ok).toBe(false);
    expect((await deleteOrder(t.db, r.id, admin)).ok).toBe(true);
    expect(await getOrder(t.db, r.id)).toBeNull();
  });

  it("a contact with orders cannot be deleted directly", async () => {
    await make();
    await expect(t.db.delete(schema.contacts).where(eq(schema.contacts.id, contactId))).rejects.toThrow();
  });
});

describe("merging contacts", () => {
  it("moves the orders to the kept contact", async () => {
    const r = await make();
    const res = await mergeContacts(t.db, otherContactId, contactId);
    expect(res.ok).toBe(true);
    expect((await getOrder(t.db, r.id))?.order.contactId).toBe(otherContactId);
  });
});

describe("listing", () => {
  it("filters by status, kind, assignee and searches number, title, name, phone", async () => {
    const a = await make({ title: "Panjabi" });
    const b = await make({ title: "Shoes", kind: "complaint" }, sam);
    await setOrderStatus(t.db, a.id, "resolved", ria);

    const ids = async (f: Parameters<typeof listOrders>[1]) => (await listOrders(t.db, f, ria.id)).map((x) => x.id).sort();
    expect(await ids({})).toEqual([a.id, b.id].sort());
    expect(await ids({ status: "open" })).toEqual([b.id]);
    expect(await ids({ status: "resolved" })).toEqual([a.id]);
    expect(await ids({ kind: "complaint" })).toEqual([b.id]);
    expect(await ids({ assigned: "me" })).toEqual([a.id]);
    expect(await ids({ assigned: sam.id })).toEqual([b.id]);
    expect(await ids({ q: "shoe" })).toEqual([b.id]);
    expect(await ids({ q: "karim" })).toHaveLength(2);
    expect(await ids({ q: "01711000001" })).toHaveLength(2);
    expect(await ids({ q: "8801711000001" })).toHaveLength(2); // the contact's WhatsApp number
    expect(await ids({ q: `ORD-${String(a.number).padStart(4, "0")}` })).toEqual([a.id]);
    expect(await ids({ q: "%" })).toEqual([]); // a literal percent sign, not a wildcard
    expect(await ids({ contactId: otherContactId })).toEqual([]);
  });

  it("shows the contact name, the contact's number and the assignee", async () => {
    await make();
    const [row] = await listOrders(t.db, {}, ria.id);
    expect(row.contactName).toBe("Karim");
    expect(row.contactIdentity).toBe("8801711000001");
    expect(row.assigneeName).toBe("ria");
    expect(row.itemCount).toBe(2);
  });

  it("filters by created date in the office time zone", async () => {
    const r = await make();
    await t.db.update(schema.orders).set({ createdAt: new Date("2026-03-20T19:00:00Z") }).where(eq(schema.orders.id, r.id)); // 21 Mar 01:00 Dhaka
    const has = async (from?: string, to?: string) => (await listOrders(t.db, { from, to }, ria.id)).length;
    expect(await has("2026-03-21", "2026-03-21")).toBe(1);
    expect(await has("2026-03-20", "2026-03-20")).toBe(0);
    expect(await has("2026-03-22")).toBe(0);
    expect(await has("garbage", "also garbage")).toBe(1); // ignored, not an error
  });
});

describe("numbers", () => {
  it("counts by status, sums money without cancelled orders, and counts open ones", async () => {
    const a = await make();
    const b = await make();
    const c = await make({ kind: "complaint", items: [] });
    await setOrderStatus(t.db, b.id, "cancelled", ria);
    await setOrderStatus(t.db, c.id, "in_progress", ria);
    const s = await orderStats(t.db);
    expect(s).toMatchObject({ total: 3, pending: 1, inProgress: 1, resolved: 0, cancelled: 1 });
    expect(s.monthAmount).toBe(1800); // only a counts: b is cancelled, c is a complaint
    expect(await openOrderCount(t.db)).toBe(2);
    void a;
  });

  it("summarises per member", async () => {
    const a = await make({}, ria);
    await make({}, sam);
    await setOrderStatus(t.db, a.id, "resolved", ria);
    const rows = await agentSummary(t.db);
    const rRia = rows.find((r) => r.userId === ria.id);
    expect(rRia).toMatchObject({ open: 0, resolved: 1, resolvedAmount: 1800 });
    expect(rows.find((r) => r.userId === sam.id)).toMatchObject({ open: 1, resolved: 0, resolvedAmount: 0 });
    expect(rows.find((r) => r.userId === admin.id)).toMatchObject({ open: 0, resolved: 0 });
  });
});
