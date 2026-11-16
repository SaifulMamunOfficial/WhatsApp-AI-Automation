import { and, asc, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";
import { canAssign, canChangeStatus, computeTotal, isOpen, parseOrderInput, type OrderStatus, type Role } from "./rules";

export type Actor = { id: string; role: Role };
export type CreateResult = { ok: true; id: string; number: number } | { ok: false; error: string };
export type Result = { ok: true } | { ok: false; error: string };

const o = schema.orders;

async function addEvent(
  tx: Pick<Db, "insert">,
  orderId: string,
  userId: string | null,
  type: string,
  fromValue: string | null,
  toValue: string | null,
) {
  await tx.insert(schema.orderEvents).values({ orderId, userId, type, fromValue, toValue });
}

/**
 * Create an order for a contact (optionally tied to a conversation). The creator takes it by
 * default. The total is computed from the item lines.
 */
export async function createOrder(
  db: Db,
  input: { contactId: string; conversationId?: string | null; fields: unknown },
  actor: Actor,
): Promise<CreateResult> {
  const parsed = parseOrderInput(input.fields);
  if (!parsed.ok) return parsed;
  const v = parsed.value;

  const [contact] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.id, input.contactId)).limit(1);
  if (!contact) return { ok: false, error: "কন্টাক্ট পাওয়া যায়নি।" };

  let conversationId: string | null = null;
  if (input.conversationId) {
    const [conv] = await db
      .select({ id: schema.conversations.id, contactId: schema.conversations.contactId })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, input.conversationId))
      .limit(1);
    if (!conv || conv.contactId !== contact.id) return { ok: false, error: "কথোপকথন এই কন্টাক্টের নয়।" };
    conversationId = conv.id;
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(o)
      .values({
        kind: v.kind,
        priority: v.priority,
        contactId: contact.id,
        conversationId,
        assignedUserId: actor.id,
        createdBy: actor.id,
        title: v.title,
        note: v.note,
        deliveryName: v.deliveryName,
        deliveryPhone: v.deliveryPhone,
        deliveryAddress: v.deliveryAddress,
        courier: v.courier,
        trackingNumber: v.trackingNumber,
        appointmentAt: v.appointmentAt,
        totalAmount: parsed.total,
      })
      .returning({ id: o.id, number: o.number });
    if (v.items.length) {
      await tx.insert(schema.orderItems).values(v.items.map((it, position) => ({ orderId: row.id, position, ...it })));
    }
    await addEvent(tx, row.id, actor.id, "created", null, v.kind);
    return { ok: true as const, id: row.id, number: row.number };
  });
}

/**
 * Edit an order. A finished order (resolved/cancelled) keeps its details; only the note can change
 * (reopen it first to edit more).
 */
export async function updateOrder(db: Db, id: string, fields: unknown, actor: Actor): Promise<Result> {
  const parsed = parseOrderInput(fields);
  if (!parsed.ok) return parsed;
  const v = parsed.value;

  const [cur] = await db.select().from(o).where(eq(o.id, id)).limit(1);
  if (!cur) return { ok: false, error: "অর্ডার পাওয়া যায়নি।" };

  return db.transaction(async (tx) => {
    const items = await tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id)).orderBy(asc(schema.orderItems.position));

    if (!isOpen(cur.status)) {
      const same =
        v.kind === cur.kind &&
        v.priority === cur.priority &&
        v.title === cur.title &&
        v.deliveryName === cur.deliveryName &&
        v.deliveryPhone === cur.deliveryPhone &&
        v.deliveryAddress === cur.deliveryAddress &&
        v.courier === cur.courier &&
        v.trackingNumber === cur.trackingNumber &&
        (v.appointmentAt?.getTime() ?? null) === (cur.appointmentAt?.getTime() ?? null) &&
        JSON.stringify(v.items) === JSON.stringify(items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })));
      if (!same) return { ok: false as const, error: "সমাধান বা বাতিল হওয়া অর্ডারের শুধু নোট বদলানো যায়। বদলাতে আগে আবার খুলুন।" };
      await tx.update(o).set({ note: v.note, updatedAt: new Date() }).where(eq(o.id, id));
      if (v.note !== cur.note) await addEvent(tx, id, actor.id, "edited", null, "note");
      return { ok: true as const };
    }

    await tx
      .update(o)
      .set({
        kind: v.kind,
        priority: v.priority,
        title: v.title,
        note: v.note,
        deliveryName: v.deliveryName,
        deliveryPhone: v.deliveryPhone,
        deliveryAddress: v.deliveryAddress,
        courier: v.courier,
        trackingNumber: v.trackingNumber,
        appointmentAt: v.appointmentAt,
        totalAmount: computeTotal(v.items),
        updatedAt: new Date(),
      })
      .where(eq(o.id, id));
    await tx.delete(schema.orderItems).where(eq(schema.orderItems.orderId, id));
    if (v.items.length) {
      await tx.insert(schema.orderItems).values(v.items.map((it, position) => ({ orderId: id, position, ...it })));
    }
    await addEvent(tx, id, actor.id, "edited", null, null);
    return { ok: true as const };
  });
}

export async function setOrderStatus(db: Db, id: string, to: OrderStatus, actor: Actor): Promise<Result> {
  const [cur] = await db.select({ status: o.status }).from(o).where(eq(o.id, id)).limit(1);
  if (!cur) return { ok: false, error: "অর্ডার পাওয়া যায়নি।" };
  if (!canChangeStatus(cur.status, to, actor.role)) {
    return { ok: false, error: isOpen(cur.status) ? "অবস্থা আগের মতোই আছে।" : "শেষ হওয়া অর্ডার শুধু অ্যাডমিন আবার খুলতে পারেন।" };
  }
  const now = new Date();
  // Conditional on the status we read, so two people changing it at once cannot both win.
  const changed = await db
    .update(o)
    .set({ status: to, updatedAt: now, resolvedAt: isOpen(to) ? null : now })
    .where(and(eq(o.id, id), eq(o.status, cur.status)))
    .returning({ id: o.id });
  if (!changed.length) return { ok: false, error: "অর্ডারটা এইমাত্র অন্য কেউ বদলেছেন। পাতা নতুন করে খুলুন।" };
  await addEvent(db, id, actor.id, "status", cur.status, to);
  return { ok: true };
}

export async function assignOrder(db: Db, id: string, targetUserId: string | null, actor: Actor): Promise<Result> {
  const [cur] = await db.select({ assignedUserId: o.assignedUserId }).from(o).where(eq(o.id, id)).limit(1);
  if (!cur) return { ok: false, error: "অর্ডার পাওয়া যায়নি।" };
  if (!canAssign(actor, cur.assignedUserId, targetUserId)) {
    return { ok: false, error: "আপনি শুধু নিজের জন্য নিতে বা নিজেরটা ছেড়ে দিতে পারেন।" };
  }
  if (targetUserId) {
    const [u] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, targetUserId), eq(schema.users.active, true)))
      .limit(1);
    if (!u) return { ok: false, error: "এই সদস্য নিষ্ক্রিয় বা পাওয়া যায়নি।" };
  }
  await db.update(o).set({ assignedUserId: targetUserId, updatedAt: new Date() }).where(eq(o.id, id));
  await addEvent(db, id, actor.id, "assigned", cur.assignedUserId, targetUserId);
  return { ok: true };
}

/** Admin only, and only for a cancelled order (normally you cancel instead of deleting). */
export async function deleteOrder(db: Db, id: string, actor: Actor): Promise<Result> {
  if (actor.role !== "admin") return { ok: false, error: "শুধু অ্যাডমিন অর্ডার মুছতে পারেন।" };
  const [cur] = await db.select({ status: o.status }).from(o).where(eq(o.id, id)).limit(1);
  if (!cur) return { ok: false, error: "অর্ডার পাওয়া যায়নি।" };
  if (cur.status !== "cancelled") return { ok: false, error: "শুধু বাতিল হওয়া অর্ডার মোছা যায়; আগে বাতিল করুন।" };
  await db.delete(o).where(eq(o.id, id));
  return { ok: true };
}
