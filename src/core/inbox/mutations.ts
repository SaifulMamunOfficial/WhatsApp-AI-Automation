import { and, eq, gt } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Role } from "@/core/auth/roles";
import { publishInboxEvent } from "./events";
import type { Db } from "./ingest";

export interface Actor {
  id: string;
  role: Role;
}

export type MutationResult = { ok: true } | { ok: false; error: string };

const emit = (conversationId: string) => publishInboxEvent({ type: "conversation", conversationId });

/**
 * Admins may assign to anyone. Agents may only take a conversation for themselves
 * or release one assigned to them.
 */
export async function assignConversation(
  db: Db,
  actor: Actor,
  conversationId: string,
  targetUserId: string | null,
): Promise<MutationResult> {
  const [conv] = await db
    .select({ assignedUserId: schema.conversations.assignedUserId })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  if (!conv) return { ok: false, error: "কথোপকথন পাওয়া যায়নি।" };

  if (actor.role !== "admin") {
    const takingForSelf = targetUserId === actor.id;
    const releasingOwn = targetUserId === null && conv.assignedUserId === actor.id;
    if (!takingForSelf && !releasingOwn) {
      return { ok: false, error: "আপনি শুধু নিজের জন্য নিতে বা নিজেরটা ছেড়ে দিতে পারেন।" };
    }
  }

  if (targetUserId) {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, targetUserId), eq(schema.users.active, true)))
      .limit(1);
    if (!user) return { ok: false, error: "ইউজার পাওয়া যায়নি।" };
  }

  await db.update(schema.conversations).set({ assignedUserId: targetUserId }).where(eq(schema.conversations.id, conversationId));
  emit(conversationId);
  return { ok: true };
}

export async function setConversationStatus(
  db: Db,
  conversationId: string,
  status: "open" | "closed",
): Promise<MutationResult> {
  const updated = await db
    .update(schema.conversations)
    .set(status === "closed" ? { status, needsHuman: false } : { status })
    .where(eq(schema.conversations.id, conversationId))
    .returning({ id: schema.conversations.id });
  if (!updated.length) return { ok: false, error: "কথোপকথন পাওয়া যায়নি।" };
  emit(conversationId);
  return { ok: true };
}

/** Lets the bot answer this conversation again after a human stepped in. */
export async function resumeBot(db: Db, conversationId: string): Promise<MutationResult> {
  const updated = await db
    .update(schema.conversations)
    .set({ botPaused: false })
    .where(eq(schema.conversations.id, conversationId))
    .returning({ id: schema.conversations.id });
  if (!updated.length) return { ok: false, error: "কথোপকথন পাওয়া যায়নি।" };
  emit(conversationId);
  return { ok: true };
}

const MAX_NOTE = 5000;

export async function addNote(db: Db, actor: Actor, conversationId: string, body: string): Promise<MutationResult> {
  const text = body.trim();
  if (!text) return { ok: false, error: "নোট খালি।" };
  if (text.length > MAX_NOTE) return { ok: false, error: `নোট সর্বোচ্চ ${MAX_NOTE} অক্ষরের হতে পারে।` };

  const [conv] = await db
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conversationId))
    .limit(1);
  if (!conv) return { ok: false, error: "কথোপকথন পাওয়া যায়নি।" };

  await db.insert(schema.conversationNotes).values({ conversationId, userId: actor.id, body: text });
  emit(conversationId);
  return { ok: true };
}

/** Clears the unread counter. Publishes only when something changed, so refresh loops cannot occur. */
export async function markRead(db: Db, conversationId: string): Promise<void> {
  const updated = await db
    .update(schema.conversations)
    .set({ unreadCount: 0 })
    .where(and(eq(schema.conversations.id, conversationId), gt(schema.conversations.unreadCount, 0)))
    .returning({ id: schema.conversations.id });
  if (updated.length) emit(conversationId);
}
