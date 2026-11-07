import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import type { ChannelAdapter, ChannelType } from "@/channels/types";
import { publishInboxEvent } from "./events";
import type { Db } from "./ingest";
import { replyWindow } from "./window";

export interface SendDeps {
  adapterFor: (type: ChannelType) => Pick<ChannelAdapter, "sendText">;
  now?: () => Date;
}

export type SendReplyInput = {
  conversationId: string;
  text: string;
} & ({ sender: "human"; userId: string } | { sender: "bot" });

export type SendReplyResult =
  | { ok: true; messageId: string }
  | { ok: false; code: "empty" | "not_found" | "channel_not_ready" | "window_closed" | "send_failed"; error: string };

const MAX_TEXT = 2000;

const WINDOW_MESSAGES = {
  no_customer_message: "এই গ্রাহক এখনো কোনো মেসেজ পাঠাননি, তাই উত্তর দেওয়া যাবে না।",
  template_required: "২৪ ঘণ্টা পার হয়ে গেছে। WhatsApp-এ এখন শুধু অনুমোদিত template পাঠানো যায়।",
  expired: "উত্তর দেওয়ার সময় (Messenger-এ সর্বোচ্চ ৭ দিন) শেষ।",
} as const;

/**
 * Sends a text reply on the conversation's own channel and records it.
 * Enforces the per-channel reply window; the bot can never use the HUMAN_AGENT tag.
 */
export async function sendReply(db: Db, deps: SendDeps, input: SendReplyInput): Promise<SendReplyResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, code: "empty", error: "মেসেজ খালি।" };
  if (text.length > MAX_TEXT) return { ok: false, code: "empty", error: `মেসেজ সর্বোচ্চ ${MAX_TEXT} অক্ষরের হতে পারে।` };

  const [row] = await db
    .select({
      conversation: schema.conversations,
      channel: schema.channels,
      toId: schema.contactIdentities.externalId,
    })
    .from(schema.conversations)
    .innerJoin(schema.channels, eq(schema.channels.id, schema.conversations.channelId))
    .innerJoin(schema.contactIdentities, eq(schema.contactIdentities.id, schema.conversations.identityId))
    .where(eq(schema.conversations.id, input.conversationId))
    .limit(1);
  if (!row) return { ok: false, code: "not_found", error: "কথোপকথন পাওয়া যায়নি।" };

  const { conversation, channel } = row;
  if (!channel.accessTokenEncrypted || channel.status === "disconnected") {
    return { ok: false, code: "channel_not_ready", error: "এই চ্যানেল এখনো সংযুক্ত নয় বা বিচ্ছিন্ন।" };
  }

  const now = deps.now?.() ?? new Date();
  const window = replyWindow(channel.type, conversation.lastCustomerMessageAt, { now, sender: input.sender });
  if (window.mode === "closed") {
    return { ok: false, code: "window_closed", error: WINDOW_MESSAGES[window.reason] };
  }
  const humanAgent = window.mode === "human_agent_only";
  const sentByUserId = input.sender === "human" ? input.userId : null;

  // Record first as pending, so a crash after sending never loses track of the attempt.
  const [pending] = await db
    .insert(schema.messages)
    .values({
      conversationId: conversation.id,
      channelId: channel.id,
      direction: "outbound",
      source: "api",
      type: "text",
      body: text,
      status: "pending",
      sentByUserId,
      sentByBot: input.sender === "bot",
      sentAt: now,
    })
    .returning({ id: schema.messages.id });

  let externalId: string;
  try {
    ({ externalId } = await deps.adapterFor(channel.type).sendText({
      channelExternalId: channel.externalId,
      accessToken: decryptSecret(channel.accessTokenEncrypted),
      to: row.toId,
      text,
      humanAgent,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "পাঠানো যায়নি।";
    await db.update(schema.messages).set({ status: "failed", error: message }).where(eq(schema.messages.id, pending.id));
    publishInboxEvent({ type: "conversation", conversationId: conversation.id });
    return { ok: false, code: "send_failed", error: message };
  }

  // The provider may have echoed this message to us before we got here (Messenger sends
  // an echo for our own API messages). If so, keep the echo row and drop our pending one.
  const [existing] = await db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(eq(schema.messages.externalId, externalId))
    .limit(1);

  let messageId = pending.id;
  if (existing) {
    await db.delete(schema.messages).where(eq(schema.messages.id, pending.id));
    await db
      .update(schema.messages)
      .set({ sentByUserId, sentByBot: input.sender === "bot", body: text, status: "sent" })
      .where(eq(schema.messages.id, existing.id));
    messageId = existing.id;
  } else {
    await db.update(schema.messages).set({ externalId, status: "sent" }).where(eq(schema.messages.id, pending.id));
  }

  await db
    .update(schema.conversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: text.slice(0, 200),
      // A person stepping in silences the bot for this conversation.
      ...(input.sender === "human" ? { botPaused: true, needsHuman: false } : {}),
    })
    .where(eq(schema.conversations.id, conversation.id));

  publishInboxEvent({ type: "conversation", conversationId: conversation.id });
  return { ok: true, messageId };
}
