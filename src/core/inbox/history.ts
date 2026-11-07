import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { HistoryChunk, HistoryThread } from "@/channels/types";
import { publishInboxEvent } from "./events";
import { ensureIdentityByKey, type Db, type Tx } from "./ingest";

// WhatsApp Coexistence history import (messages from before the number was connected).
//
// Differences from live ingestion, all deliberate:
//  - messages get source "history" and never raise the unread counter;
//  - the bot is never paused or triggered by them;
//  - conversations created only by history start "closed", so six months of old chats do
//    not flood the open inbox. A thread whose newest message is a recent customer message
//    is opened so nobody misses it.
//  - everything is idempotent (messages.external_id is unique): Meta may resend chunks and
//    the live echo of a message may already exist.

const PREVIEW_MAX = 200;
const REOPEN_WITHIN_MS = 48 * 60 * 60 * 1000;
const INSERT_BATCH = 200;

export async function ingestHistoryChunk(db: Db, chunk: HistoryChunk): Promise<number> {
  const [channel] = await db
    .select({ id: schema.channels.id })
    .from(schema.channels)
    .where(and(eq(schema.channels.type, chunk.channelType), eq(schema.channels.externalId, chunk.channelExternalId)))
    .limit(1);
  if (!channel) return 0;

  if (chunk.error) {
    await recordSync(db, channel.id, {
      status: chunk.error.declined ? "declined" : "failed",
      error: chunk.error.message,
    });
    return 0;
  }

  let imported = 0;
  for (const thread of chunk.threads) {
    if (thread.messages.length === 0) continue;
    const { inserted, conversationId } = await db.transaction((tx) => importThread(tx, channel.id, thread));
    imported += inserted;
    if (inserted > 0) publishInboxEvent({ type: "conversation", conversationId });
  }

  await recordSync(db, channel.id, {
    status: chunk.progress >= 100 ? "complete" : "in_progress",
    progress: chunk.progress,
    addMessages: imported,
  });
  return imported;
}

async function importThread(tx: Tx, channelId: string, thread: HistoryThread) {
  const identity = await ensureIdentityByKey(tx, channelId, thread.contactExternalId, thread.contactName);
  const msgs = [...thread.messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const newest = msgs[msgs.length - 1];
  const newestInbound = [...msgs].reverse().find((m) => m.direction === "inbound");
  const preview = (newest.text?.trim() || `[${newest.type}]`).slice(0, PREVIEW_MAX);

  const c = schema.conversations;
  const created = await tx
    .insert(c)
    .values({
      channelId,
      contactId: identity.contactId,
      identityId: identity.id,
      status: "closed",
      lastMessageAt: newest.timestamp,
      lastMessagePreview: preview,
      lastCustomerMessageAt: newestInbound?.timestamp ?? null,
    })
    .onConflictDoNothing({ target: [c.channelId, c.identityId] })
    .returning({ id: c.id });

  let conversationId: string;
  if (created.length) {
    conversationId = created[0].id;
  } else {
    const [existing] = await tx
      .select({ id: c.id })
      .from(c)
      .where(and(eq(c.channelId, channelId), eq(c.identityId, identity.id)))
      .limit(1);
    conversationId = existing.id;
  }

  let inserted = 0;
  for (let i = 0; i < msgs.length; i += INSERT_BATCH) {
    const rows = await tx
      .insert(schema.messages)
      .values(
        msgs.slice(i, i + INSERT_BATCH).map((m) => ({
          conversationId,
          channelId,
          externalId: m.externalId,
          direction: m.direction,
          source: "history" as const,
          type: m.type,
          body: m.text ?? null,
          status: m.status ?? "sent",
          sentAt: m.timestamp,
          raw: m.raw ?? null,
        })),
      )
      .onConflictDoNothing({ target: schema.messages.externalId })
      .returning({ id: schema.messages.id });
    inserted += rows.length;
  }

  if (!created.length && inserted > 0) {
    // Existing conversation (live messages already arrived): only move "last" markers forward.
    const iso = newest.timestamp.toISOString();
    await tx
      .update(c)
      .set({
        lastMessageAt: sql`greatest(${c.lastMessageAt}, ${iso}::timestamptz)`,
        lastMessagePreview: sql`case when ${iso}::timestamptz > ${c.lastMessageAt} then ${preview} else ${c.lastMessagePreview} end`,
        ...(newestInbound
          ? {
              lastCustomerMessageAt: sql`greatest(coalesce(${c.lastCustomerMessageAt}, ${newestInbound.timestamp.toISOString()}::timestamptz), ${newestInbound.timestamp.toISOString()}::timestamptz)`,
            }
          : {}),
      })
      .where(eq(c.id, conversationId));
  }

  // A freshly imported thread ending in a recent customer message needs attention.
  if (created.length && newest.direction === "inbound" && Date.now() - newest.timestamp.getTime() < REOPEN_WITHIN_MS) {
    await tx.update(c).set({ status: "open" }).where(eq(c.id, conversationId));
  }

  return { inserted, conversationId };
}

async function recordSync(
  db: Db,
  channelId: string,
  update: {
    status: (typeof schema.historySyncStatus.enumValues)[number];
    progress?: number;
    error?: string;
    addMessages?: number;
  },
) {
  const s = schema.whatsappSyncState;
  // Progress never goes backwards (chunks arrive out of order); a finished or declined sync is final.
  await db
    .update(s)
    .set({
      historyStatus: sql`case when ${s.historyStatus} in ('complete', 'declined') then ${s.historyStatus} else ${update.status}::history_sync_status end`,
      historyProgress: update.progress !== undefined ? sql`greatest(${s.historyProgress}, ${update.progress})` : s.historyProgress,
      historyMessageCount: update.addMessages ? sql`${s.historyMessageCount} + ${update.addMessages}` : s.historyMessageCount,
      lastError: update.error ?? s.lastError,
      updatedAt: new Date(),
    })
    .where(eq(s.channelId, channelId));
}
