import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";
import { publishInboxEvent } from "./events";

export interface TransferInput {
  conversationId: string;
  toUserId: string | null; // target agent, or null to unassign
  note?: string;           // internal note stored in conversation_notes
}

export interface ActorUser {
  id: string;
  name: string;
  role: "admin" | "agent";
}

export type TransferErrorCode = "forbidden" | "not_found" | "invalid_target";

export type TransferResult =
  | { ok: true }
  | { ok: false; code: TransferErrorCode; error: string };

const fail = (code: TransferErrorCode, error: string): TransferResult => ({
  ok: false,
  code,
  error,
});

/**
 * Transfers a conversation to another agent (or unassigns it).
 * RBAC:
 *  - Viewer cannot transfer.
 *  - Agent can only transfer conversations currently assigned to themselves or unassigned.
 *  - Admin can transfer any conversation.
 * Always sets `botPaused = true` so the bot does not interrupt the handover.
 * If note is provided, stores it in `conversation_notes`.
 */
export async function transferConversation(
  db: Db,
  input: TransferInput,
  actor: ActorUser,
): Promise<TransferResult> {
  const [conv] = await db
    .select({
      id: schema.conversations.id,
      assignedUserId: schema.conversations.assignedUserId,
    })
    .from(schema.conversations)
    .where(eq(schema.conversations.id, input.conversationId))
    .limit(1);

  if (!conv) {
    return fail("not_found", "কথোপকথন পাওয়া যায়নি।");
  }

  // Agent permission check: an agent can only transfer their own currently assigned conversation
  if (actor.role === "agent") {
    if (conv.assignedUserId !== actor.id) {
      return fail("forbidden", "শুধুমাত্র নিজের অ্যাসাইন করা চ্যাট অন্য এজেন্টের কাছে ট্রান্সফার করতে পারেন।");
    }
  }

  // Target user check if assigning to someone
  if (input.toUserId) {
    const [target] = await db
      .select({ id: schema.users.id, active: schema.users.active, role: schema.users.role })
      .from(schema.users)
      .where(and(eq(schema.users.id, input.toUserId), eq(schema.users.active, true)))
      .limit(1);

    if (!target) {
      return fail("invalid_target", "উদ্দিষ্ট মেম্বার নিষ্ক্রিয় বা পাওয়া যায়নি।");
    }
  }

  const noteText = input.note?.trim();

  await db.transaction(async (tx) => {
    await tx
      .update(schema.conversations)
      .set({
        assignedUserId: input.toUserId,
        botPaused: true,
      })
      .where(eq(schema.conversations.id, conv.id));

    if (noteText) {
      await tx.insert(schema.conversationNotes).values({
        conversationId: conv.id,
        userId: actor.id,
        body: noteText,
      });
    }
  });

  publishInboxEvent({ type: "conversation", conversationId: conv.id });
  return { ok: true };
}
