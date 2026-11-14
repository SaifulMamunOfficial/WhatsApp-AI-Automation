import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { sendTemplateToConversation } from "@/core/inbox/send-template";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "c".repeat(64);
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());

let conv: string;
let channelId: string;
let userId: string;
let contactId: string;

beforeEach(async () => {
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.channels);
  await t.db.delete(schema.users);
  const [ch] = await t.db.insert(schema.channels).values({ type: "whatsapp", name: "WA", externalId: "PNID", status: "active", isTest: true, accessTokenEncrypted: encryptSecret("TOKEN-9") }).returning();
  channelId = ch.id;
  const [c] = await t.db.insert(schema.contacts).values({ name: "Rahim" }).returning();
  contactId = c.id;
  const [i] = await t.db.insert(schema.contactIdentities).values({ contactId: c.id, channelId: ch.id, externalId: "8801711000001" }).returning();
  const [cv] = await t.db
    .insert(schema.conversations)
    .values({ channelId: ch.id, contactId: c.id, identityId: i.id, lastCustomerMessageAt: new Date("2026-01-01T00:00:00Z"), needsHuman: true })
    .returning();
  conv = cv.id;
  const [u] = await t.db.insert(schema.users).values({ email: "a@x.org", name: "A", passwordHash: "x", role: "agent" }).returning();
  userId = u.id;
  await t.db.insert(schema.templates).values([
    { channelId: ch.id, name: "follow_up", language: "bn", category: "utility", status: "approved", components: [{ type: "BODY", text: "হ্যালো {{1}}, আপনার ভর্তি নিয়ে জানতে চাই। {{2}}" }] },
    { channelId: ch.id, name: "offer", language: "bn", category: "marketing", status: "approved", components: [{ type: "BODY", text: "ঈদ অফার চলছে!" }] },
    { channelId: ch.id, name: "waiting", language: "bn", category: "utility", status: "pending", components: [{ type: "BODY", text: "x" }] },
  ]);
});

const tpl = async (name: string) => (await t.db.select().from(schema.templates).where(eq(schema.templates.name, name)))[0];
const ok = () => vi.fn(async () => ({ externalId: "wamid.T1" }));
const run = async (name: string, params: string[], send = ok()) => {
  const r = await sendTemplateToConversation(t.db, { send, now: () => new Date("2026-03-10T08:00:00Z") }, { conversationId: conv, templateId: (await tpl(name)).id, params, userId });
  return { r, send };
};

describe("sendTemplateToConversation", () => {
  it("sends an approved utility template with the values, records it, and hands over to the human", async () => {
    const { r, send } = await run("follow_up", ["রহিম", "কাল ফোন করবেন?"]);
    expect(r.ok).toBe(true);
    expect(send).toHaveBeenCalledWith({ channelExternalId: "PNID", accessToken: "TOKEN-9", to: "8801711000001", name: "follow_up", language: "bn", bodyParams: ["রহিম", "কাল ফোন করবেন?"] });
    const [m] = await t.db.select().from(schema.messages);
    expect(m).toMatchObject({ type: "template", direction: "outbound", source: "api", status: "sent", externalId: "wamid.T1", sentByUserId: userId, sentByBot: false, body: "হ্যালো রহিম, আপনার ভর্তি নিয়ে জানতে চাই। কাল ফোন করবেন?" });
    const [c] = await t.db.select().from(schema.conversations);
    expect(c).toMatchObject({ botPaused: true, needsHuman: false, lastMessagePreview: m.body });
    // the 24-hour window is NOT reopened by our own message
    expect(c.lastCustomerMessageAt?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("needs exactly one value per {{n}}, none empty, none huge", async () => {
    expect((await run("follow_up", ["x"])).r.ok).toBe(false);
    expect((await run("follow_up", ["x", "  "])).r.ok).toBe(false);
    expect((await run("follow_up", ["x", "y".repeat(501)])).r.ok).toBe(false);
    expect((await run("follow_up", ["x", "y", "z"])).r.ok).toBe(false);
    expect(await t.db.select().from(schema.messages)).toHaveLength(0);
  });

  it("refuses templates that are not approved or belong to another channel", async () => {
    expect((await run("waiting", ["x"])).r.ok).toBe(false);
    const [other] = await t.db.insert(schema.channels).values({ type: "whatsapp", name: "Other", externalId: "P2", status: "active", isTest: true, accessTokenEncrypted: encryptSecret("T") }).returning();
    const [foreign] = await t.db.insert(schema.templates).values({ channelId: other.id, name: "foreign", language: "bn", category: "utility", status: "approved", components: [{ type: "BODY", text: "x" }] }).returning();
    const send = ok();
    const r = await sendTemplateToConversation(t.db, { send }, { conversationId: conv, templateId: foreign.id, params: [], userId });
    expect(r.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("marketing templates need the customer's opt-in", async () => {
    const blocked = await run("offer", []);
    expect(blocked.r.ok).toBe(false);
    expect(blocked.send).not.toHaveBeenCalled();
    await t.db.update(schema.contacts).set({ optedIn: true }).where(eq(schema.contacts.id, contactId));
    expect((await run("offer", [])).r.ok).toBe(true);
  });

  it("only on a connected WhatsApp channel and to a real phone number", async () => {
    await t.db.update(schema.channels).set({ status: "disconnected" }).where(eq(schema.channels.id, channelId));
    expect((await run("follow_up", ["a", "b"])).r.ok).toBe(false);
    await t.db.update(schema.channels).set({ status: "active" }).where(eq(schema.channels.id, channelId));
    await t.db.update(schema.contactIdentities).set({ externalId: "BSUID.abc123" });
    expect((await run("follow_up", ["a", "b"])).r.ok).toBe(false);
  });

  it("a Messenger conversation cannot send a WhatsApp template", async () => {
    const [fb] = await t.db.insert(schema.channels).values({ type: "messenger", name: "FB", externalId: "PAGE", status: "active", isTest: true, accessTokenEncrypted: encryptSecret("T") }).returning();
    const [i] = await t.db.insert(schema.contactIdentities).values({ contactId, channelId: fb.id, externalId: "PSID1" }).returning();
    const [cv] = await t.db.insert(schema.conversations).values({ channelId: fb.id, contactId, identityId: i.id }).returning();
    const send = ok();
    const r = await sendTemplateToConversation(t.db, { send }, { conversationId: cv.id, templateId: (await tpl("follow_up")).id, params: ["a", "b"], userId });
    expect(r.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("marks the message failed and keeps the reason when Meta refuses; never stores the token", async () => {
    const send = vi.fn(async () => {
      throw new Error("Message undeliverable");
    });
    const { r } = await run("follow_up", ["a", "b"], send);
    expect(r).toEqual({ ok: false, error: "Message undeliverable" });
    const [m] = await t.db.select().from(schema.messages);
    expect(m).toMatchObject({ status: "failed", error: "Message undeliverable" });
    expect(JSON.stringify(m)).not.toContain("TOKEN-9");
    expect((await t.db.select().from(schema.conversations))[0].needsHuman).toBe(true); // unchanged on failure
  });

  it("unknown conversation or template", async () => {
    const ghost = "00000000-0000-0000-0000-000000000000";
    expect((await sendTemplateToConversation(t.db, { send: ok() }, { conversationId: ghost, templateId: ghost, params: [], userId })).ok).toBe(false);
    expect((await sendTemplateToConversation(t.db, { send: ok() }, { conversationId: conv, templateId: ghost, params: [], userId })).ok).toBe(false);
  });
});
