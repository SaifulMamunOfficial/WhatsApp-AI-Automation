import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { looksLike } from "@/core/media/download";
import { saveMedia } from "@/core/media/storage";
import { publishInboxEvent } from "./events";
import type { Db } from "./ingest";
import { replyWindow } from "./window";
import type { SendDeps } from "./send";

// Staff send a picture to a customer from the inbox. Same rules as a text reply (the channel's
// reply window, HUMAN_AGENT only for a real person) plus limits on the file itself.

/** `captionAsText`: Messenger cannot put text under a picture, so the caller sends it as a separate message. */
export type SendImageResult = { ok: true; messageId: string; captionAsText: string | null } | { ok: false; error: string };

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // WhatsApp's limit for images
export const MAX_CAPTION = 1000; // WhatsApp captions allow 1024

const TYPES = { "image/jpeg": "jpg", "image/png": "png" } as const;
type ImageMime = keyof typeof TYPES;

export const isImageMime = (m: string): m is ImageMime => m in TYPES;

export interface ImageFile {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}

export interface SendImageDeps extends SendDeps {
  /** Where the sent picture is kept so the inbox can show it. Defaults to MEDIA_DIR. */
  dir?: string;
}

/** Checks the file; returns what is wrong, or null. Exported for the reply box's server action and tests. */
export function validateImage(file: ImageFile): string | null {
  if (!isImageMime(file.mimeType)) return "শুধু JPEG বা PNG ছবি পাঠানো যায়।";
  if (file.bytes.byteLength === 0) return "ফাইল খালি।";
  if (file.bytes.byteLength > MAX_IMAGE_BYTES) return "ছবি ৫ MB-এর বেশি হতে পারবে না।";
  if (!looksLike(file.mimeType, file.bytes)) return "ফাইলটা আসলে ছবি নয় বা ধরন মিলছে না।";
  return null;
}

export async function sendImageReply(
  db: Db,
  deps: SendImageDeps,
  input: { conversationId: string; userId: string; file: ImageFile; caption?: string },
): Promise<SendImageResult> {
  const fail = (error: string) => ({ ok: false as const, error });
  const problem = validateImage(input.file);
  if (problem) return fail(problem);
  const caption = (input.caption ?? "").trim();
  if (caption.length > MAX_CAPTION) return fail(`লেখা সর্বোচ্চ ${MAX_CAPTION} অক্ষরের হতে পারে।`);
  const mime = input.file.mimeType as ImageMime;

  const [row] = await db
    .select({ conversation: schema.conversations, channel: schema.channels, toId: schema.contactIdentities.externalId })
    .from(schema.conversations)
    .innerJoin(schema.channels, eq(schema.channels.id, schema.conversations.channelId))
    .innerJoin(schema.contactIdentities, eq(schema.contactIdentities.id, schema.conversations.identityId))
    .where(eq(schema.conversations.id, input.conversationId))
    .limit(1);
  if (!row) return fail("কথোপকথন পাওয়া যায়নি।");
  const { conversation, channel } = row;
  if (!channel.accessTokenEncrypted || channel.status === "disconnected") return fail("এই চ্যানেল এখনো সংযুক্ত নয় বা বিচ্ছিন্ন।");

  const adapter = deps.adapterFor(channel.type);
  if (!adapter.sendImage) return fail("এই চ্যানেলে ছবি পাঠানো যায় না।");

  const now = deps.now?.() ?? new Date();
  const window = replyWindow(channel.type, conversation.lastCustomerMessageAt, { now, sender: "human" });
  if (window.mode === "closed") {
    return fail(
      window.reason === "template_required"
        ? "২৪ ঘণ্টা পার হয়ে গেছে। WhatsApp-এ এখন শুধু অনুমোদিত template পাঠানো যায়।"
        : window.reason === "expired"
          ? "উত্তর দেওয়ার সময় (Messenger-এ সর্বোচ্চ ৭ দিন) শেষ।"
          : "এই গ্রাহক এখনো কোনো মেসেজ পাঠাননি, তাই উত্তর দেওয়া যাবে না।",
    );
  }
  const humanAgent = window.mode === "human_agent_only";

  // Keep our own copy first (the inbox shows it from there), then record as pending, then send.
  const storageKey = await saveMedia(input.file.bytes, TYPES[mime], deps.dir);
  const shownCaption = channel.type === "whatsapp" ? caption : ""; // Messenger sends the caption as a separate text
  const [pending] = await db
    .insert(schema.messages)
    .values({
      conversationId: conversation.id,
      channelId: channel.id,
      direction: "outbound",
      source: "api",
      type: "image",
      body: shownCaption || null,
      status: "pending",
      sentByUserId: input.userId,
      sentAt: now,
    })
    .returning({ id: schema.messages.id });
  await db.insert(schema.messageMedia).values({
    messageId: pending.id,
    refKind: "upload",
    ref: "",
    mimeType: mime,
    fileName: input.file.fileName.slice(0, 120),
    status: "ready",
    storageKey,
    sizeBytes: input.file.bytes.byteLength,
  });

  let externalId: string;
  try {
    ({ externalId } = await adapter.sendImage({
      channelExternalId: channel.externalId,
      accessToken: decryptSecret(channel.accessTokenEncrypted),
      to: row.toId,
      bytes: input.file.bytes,
      mimeType: mime,
      fileName: input.file.fileName,
      caption: shownCaption || undefined,
      humanAgent,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "পাঠানো যায়নি।";
    await db.update(schema.messages).set({ status: "failed", error: message }).where(eq(schema.messages.id, pending.id));
    publishInboxEvent({ type: "conversation", conversationId: conversation.id });
    return fail(message);
  }

  // Messenger may echo our own message back before we get here; keep the echo row, drop ours.
  const [existing] = await db.select({ id: schema.messages.id }).from(schema.messages).where(eq(schema.messages.externalId, externalId)).limit(1);
  let messageId = pending.id;
  if (existing) {
    await db.delete(schema.messages).where(eq(schema.messages.id, pending.id)); // its media row goes with it (cascade)
    await db.update(schema.messages).set({ sentByUserId: input.userId, status: "sent" }).where(eq(schema.messages.id, existing.id));
    messageId = existing.id;
  } else {
    await db.update(schema.messages).set({ externalId, status: "sent" }).where(eq(schema.messages.id, pending.id));
  }

  await db
    .update(schema.conversations)
    .set({ lastMessageAt: now, lastMessagePreview: (shownCaption || "[image]").slice(0, 200), botPaused: true, needsHuman: false })
    .where(eq(schema.conversations.id, conversation.id));

  publishInboxEvent({ type: "conversation", conversationId: conversation.id });
  return { ok: true, messageId, captionAsText: channel.type === "messenger" && caption ? caption : null };
}
