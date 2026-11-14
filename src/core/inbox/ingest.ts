import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import type { NormalizedMessage, StatusUpdate, WebhookEvents } from "@/channels/types";
import { publishInboxEvent } from "./events";
import { ingestContactSync } from "@/core/contacts/sync";
import { ingestHistoryChunk } from "./history";
import { applyTemplateStatusEvents } from "@/core/broadcast/templates";
import { isOptOutText } from "@/core/contacts/consent";

// Channel-neutral ingestion: turns normalized webhook events into contacts,
// conversations and messages. It must be fast (webhooks answer 200 quickly) and
// idempotent (Meta retries; the same wamid/mid can arrive more than once).

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface IngestResult {
  stored: number;
  duplicates: number;
  unknownChannel: number;
  statusesApplied: number;
  /** Coexistence: past messages imported from history chunks. */
  historyMessages: number;
  /** Coexistence: contacts added from the phone's address book. */
  contactsSynced: number;
  /** Templates whose status changed (Meta review result, pause, ...). */
  templatesUpdated: number;
  /** Customers who withdrew consent by replying with a stop word. */
  optedOut: number;
  /** Newly stored live customer messages: the automation engine runs on these. */
  newInbound: { conversationId: string; messageExternalId: string }[];
  /** Newly stored messages with an attached file: ids of message_media rows waiting to be downloaded. */
  newMedia: string[];
  failed: number;
}

type MessageOutcome = "stored" | "duplicate" | "unknown_channel";

const PREVIEW_MAX = 200;

function previewOf(m: NormalizedMessage): string {
  const text = m.text?.trim();
  return (text ? text : `[${m.type}]`).slice(0, PREVIEW_MAX);
}

export async function ingestEvents(db: Db, events: WebhookEvents): Promise<IngestResult> {
  const result: IngestResult = {
    stored: 0,
    duplicates: 0,
    unknownChannel: 0,
    statusesApplied: 0,
    historyMessages: 0,
    contactsSynced: 0,
    templatesUpdated: 0,
    optedOut: 0,
    newInbound: [],
    newMedia: [],
    failed: 0,
  };
  let firstError: unknown;

  // Oldest first so conversation previews and "last message" end up correct.
  const messages = [...events.messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  for (const m of messages) {
    try {
      const { outcome, conversationId, mediaId } = await ingestMessage(db, m);
      if (outcome === "stored") {
        result.stored++;
        if (mediaId) result.newMedia.push(mediaId);
        // Published after the transaction committed, so listeners always see the data.
        if (conversationId) {
          publishInboxEvent({ type: "conversation", conversationId });
          if (m.direction === "inbound" && m.source === "api") {
            result.newInbound.push({ conversationId, messageExternalId: m.externalId });
            if (m.type === "text" && isOptOutText(m.text) && (await withdrawConsent(db, conversationId))) result.optedOut++;
          }
        }
      } else if (outcome === "duplicate") result.duplicates++;
      else result.unknownChannel++;
    } catch (err) {
      // Keep processing the rest of the batch, then fail the request so Meta retries.
      // Retrying is safe because ingestion is idempotent.
      result.failed++;
      firstError ??= err;
    }
  }

  for (const s of events.statuses) {
    try {
      result.statusesApplied += await applyStatus(db, s);
    } catch (err) {
      result.failed++;
      firstError ??= err;
    }
  }

  if (events.templateStatus?.length) {
    try {
      result.templatesUpdated += await applyTemplateStatusEvents(db, events.templateStatus);
    } catch (err) {
      result.failed++;
      firstError ??= err;
    }
  }

  // WhatsApp Coexistence: contacts first, so history threads attach to named contacts.
  if (events.contactSync?.length) {
    try {
      result.contactsSynced += await ingestContactSync(db, events.contactSync);
    } catch (err) {
      result.failed++;
      firstError ??= err;
    }
  }
  for (const chunk of events.history ?? []) {
    try {
      result.historyMessages += await ingestHistoryChunk(db, chunk);
    } catch (err) {
      result.failed++;
      firstError ??= err;
    }
  }

  if (firstError) throw firstError;
  return result;
}

async function ingestMessage(
  db: Db,
  m: NormalizedMessage,
): Promise<{ outcome: MessageOutcome; conversationId?: string; mediaId?: string }> {
  const [channel] = await db
    .select({ id: schema.channels.id })
    .from(schema.channels)
    .where(and(eq(schema.channels.type, m.channelType), eq(schema.channels.externalId, m.channelExternalId)))
    .limit(1);
  if (!channel) return { outcome: "unknown_channel" };

  return db.transaction(async (tx) => {
    const [dup] = await tx
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .where(eq(schema.messages.externalId, m.externalId))
      .limit(1);
    if (dup) return { outcome: "duplicate" as const };

    const identity = await ensureIdentity(tx, channel.id, m);
    const conversationId = await ensureConversation(tx, channel.id, identity, m);

    const inserted = await tx
      .insert(schema.messages)
      .values({
        conversationId,
        channelId: channel.id,
        externalId: m.externalId,
        direction: m.direction,
        source: m.source,
        type: m.type,
        body: m.text ?? null,
        status: "sent",
        sentAt: m.timestamp,
        raw: m.raw ?? null,
      })
      .onConflictDoNothing({ target: schema.messages.externalId })
      .returning({ id: schema.messages.id });
    if (inserted.length === 0) return { outcome: "duplicate" as const }; // lost a race with a concurrent delivery

    let mediaId: string | undefined;
    if (m.media) {
      const [media] = await tx
        .insert(schema.messageMedia)
        .values({ messageId: inserted[0].id, refKind: m.media.kind, ref: m.media.ref, mimeType: m.media.mimeType ?? null, fileName: m.media.fileName ?? null })
        .onConflictDoNothing()
        .returning({ id: schema.messageMedia.id });
      mediaId = media?.id;
    }

    await touchConversation(tx, conversationId, m);
    return { outcome: "stored" as const, conversationId, mediaId };
  });
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function ensureIdentity(tx: Tx, channelId: string, m: NormalizedMessage) {
  return ensureIdentityByKey(tx, channelId, m.contactExternalId, m.contactName);
}

/**
 * Finds or creates the contact + identity for a customer on a channel. Safe against
 * concurrent creation. Also fills in a name the contact never had.
 */
export async function ensureIdentityByKey(
  tx: Tx,
  channelId: string,
  contactExternalId: string,
  contactName?: string,
) {
  const find = () =>
    tx
      .select({ id: schema.contactIdentities.id, contactId: schema.contactIdentities.contactId })
      .from(schema.contactIdentities)
      .where(
        and(
          eq(schema.contactIdentities.channelId, channelId),
          eq(schema.contactIdentities.externalId, contactExternalId),
        ),
      )
      .limit(1);

  let [identity] = await find();

  if (!identity) {
    const [contact] = await tx
      .insert(schema.contacts)
      .values({ name: contactName ?? null })
      .returning({ id: schema.contacts.id });
    const created = await tx
      .insert(schema.contactIdentities)
      .values({
        contactId: contact.id,
        channelId,
        externalId: contactExternalId,
        displayName: contactName ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: schema.contactIdentities.id, contactId: schema.contactIdentities.contactId });

    if (created.length) {
      identity = created[0];
    } else {
      // A concurrent request created it first: drop our orphan contact and use theirs.
      await tx.delete(schema.contacts).where(eq(schema.contacts.id, contact.id));
      [identity] = await find();
    }
  } else if (contactName) {
    // Keep names fresh, and fill a contact's name if it never had one.
    await tx
      .update(schema.contactIdentities)
      .set({ displayName: contactName })
      .where(eq(schema.contactIdentities.id, identity.id));
    await tx
      .update(schema.contacts)
      .set({ name: contactName, updatedAt: new Date() })
      .where(and(eq(schema.contacts.id, identity.contactId), sql`${schema.contacts.name} is null`));
  }

  return identity;
}

async function ensureConversation(
  tx: Tx,
  channelId: string,
  identity: { id: string; contactId: string },
  m: NormalizedMessage,
): Promise<string> {
  await tx
    .insert(schema.conversations)
    .values({
      channelId,
      contactId: identity.contactId,
      identityId: identity.id,
      lastMessageAt: m.timestamp,
    })
    .onConflictDoNothing({ target: [schema.conversations.channelId, schema.conversations.identityId] });

  const [conv] = await tx
    .select({ id: schema.conversations.id })
    .from(schema.conversations)
    .where(and(eq(schema.conversations.channelId, channelId), eq(schema.conversations.identityId, identity.id)))
    .limit(1);
  return conv.id;
}

async function touchConversation(tx: Tx, conversationId: string, m: NormalizedMessage) {
  const iso = m.timestamp.toISOString();
  const preview = previewOf(m);
  const c = schema.conversations;

  // A late-arriving older message must not rewind "last message" or its preview.
  const base = {
    lastMessageAt: sql`greatest(${c.lastMessageAt}, ${iso}::timestamptz)`,
    lastMessagePreview: sql`case when ${iso}::timestamptz >= ${c.lastMessageAt} then ${preview} else ${c.lastMessagePreview} end`,
  };

  if (m.direction === "inbound") {
    await tx
      .update(c)
      .set({
        ...base,
        lastCustomerMessageAt: sql`greatest(coalesce(${c.lastCustomerMessageAt}, ${iso}::timestamptz), ${iso}::timestamptz)`,
        unreadCount: sql`${c.unreadCount} + 1`,
        status: "open",
      })
      .where(eq(c.id, conversationId));
  } else {
    // A human replied from the phone / page inbox: the bot must stay silent here.
    const humanReply = m.source === "phone_app" || m.source === "page_inbox";
    await tx
      .update(c)
      .set(humanReply ? { ...base, botPaused: true, needsHuman: false } : base)
      .where(eq(c.id, conversationId));
  }
}

// A status may only move forward (pending < sent < delivered < read); webhooks can
// arrive out of order. `failed` only applies to messages not yet delivered.
const APPLIES_OVER: Record<StatusUpdate["status"], (typeof schema.messages.$inferSelect.status)[]> = {
  sent: ["pending"],
  delivered: ["pending", "sent"],
  read: ["pending", "sent", "delivered"],
  failed: ["pending", "sent"],
};

async function applyStatus(db: Db, s: StatusUpdate): Promise<number> {
  const updated = await db
    .update(schema.messages)
    .set({ status: s.status, error: s.status === "failed" ? (s.error ?? "failed") : null })
    .where(and(eq(schema.messages.externalId, s.externalId), inArray(schema.messages.status, APPLIES_OVER[s.status])))
    .returning({ id: schema.messages.id, conversationId: schema.messages.conversationId });
  for (const row of updated) publishInboxEvent({ type: "conversation", conversationId: row.conversationId });
  return updated.length;
}

/** A customer replied with a stop word: they no longer receive broadcasts. */
async function withdrawConsent(db: Db, conversationId: string): Promise<boolean> {
  const [conv] = await db.select({ contactId: schema.conversations.contactId }).from(schema.conversations).where(eq(schema.conversations.id, conversationId)).limit(1);
  if (!conv) return false;
  const done = await db
    .update(schema.contacts)
    .set({ optedIn: false, optInSource: "customer_stop", updatedAt: new Date() })
    .where(and(eq(schema.contacts.id, conv.contactId), eq(schema.contacts.optedIn, true)))
    .returning({ id: schema.contacts.id });
  return done.length > 0;
}
