import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { placeholderCount, renderTemplate, sendWhatsAppTemplate, templateBodyText, type SendTemplateInput } from "@/channels/whatsapp/templates";
import { publishInboxEvent } from "./events";
import type { Db } from "./ingest";

// Sends ONE approved WhatsApp template to the customer of a conversation, by a staff member.
// This is how staff write to a customer after the 24-hour window has closed. The same safety
// rules as broadcasts apply: approved templates only, a real phone number, and marketing templates
// only to people who opted in (service/"utility" templates answer a customer who wrote to us).

export interface SendTemplateDeps {
  send?: (input: SendTemplateInput) => Promise<{ externalId: string }>;
  now?: () => Date;
}

export type SendTemplateResult = { ok: true; messageId: string } | { ok: false; error: string };

export const MAX_PARAM_LENGTH = 500;
const PHONE = /^\d{8,15}$/;

export async function sendTemplateToConversation(
  db: Db,
  deps: SendTemplateDeps,
  input: { conversationId: string; templateId: string; params: string[]; userId: string },
): Promise<SendTemplateResult> {
  const fail = (error: string) => ({ ok: false as const, error });

  const [row] = await db
    .select({
      conversation: schema.conversations,
      channel: schema.channels,
      toId: schema.contactIdentities.externalId,
      optedIn: schema.contacts.optedIn,
    })
    .from(schema.conversations)
    .innerJoin(schema.channels, eq(schema.channels.id, schema.conversations.channelId))
    .innerJoin(schema.contactIdentities, eq(schema.contactIdentities.id, schema.conversations.identityId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
    .where(eq(schema.conversations.id, input.conversationId))
    .limit(1);
  if (!row) return fail("কথোপকথন পাওয়া যায়নি।");
  const { conversation, channel } = row;

  if (channel.type !== "whatsapp") return fail("টেমপ্লেট শুধু WhatsApp-এ পাঠানো যায়।");
  if (!channel.accessTokenEncrypted || channel.status !== "active") return fail("এই চ্যানেল এখনো সংযুক্ত নয় বা বিচ্ছিন্ন।");
  if (!PHONE.test(row.toId)) return fail("এই গ্রাহকের আসল ফোন নম্বর নেই, তাই টেমপ্লেট পাঠানো যায় না।");

  const [template] = await db
    .select()
    .from(schema.templates)
    .where(and(eq(schema.templates.id, input.templateId), eq(schema.templates.channelId, channel.id)))
    .limit(1);
  if (!template) return fail("টেমপ্লেট পাওয়া যায়নি।");
  if (template.status !== "approved") return fail("শুধু Meta-র অনুমোদিত (approved) টেমপ্লেট পাঠানো যায়।");
  if (template.category.toLowerCase() === "marketing" && !row.optedIn) return fail("এই গ্রাহক প্রচারমূলক বার্তা পেতে সম্মতি দেননি, তাই marketing টেমপ্লেট পাঠানো যায় না।");

  const body = templateBodyText(template.components);
  const needed = placeholderCount(body);
  const params = input.params.map((p) => p.trim());
  if (params.length !== needed) return fail(`টেমপ্লেটে ${needed}টি ভেরিয়েবল আছে, মান দিতে হবে ঠিক ${needed}টি।`);
  if (params.some((p) => !p || p.length > MAX_PARAM_LENGTH)) return fail("ভেরিয়েবলের মান খালি রাখা যাবে না।");

  const text = renderTemplate(body, params);
  const now = deps.now?.() ?? new Date();

  // Record first as pending, so a crash after sending never loses track of the attempt.
  const [pending] = await db
    .insert(schema.messages)
    .values({
      conversationId: conversation.id,
      channelId: channel.id,
      direction: "outbound",
      source: "api",
      type: "template",
      body: text,
      status: "pending",
      sentByUserId: input.userId,
      sentAt: now,
      raw: { template: template.name, language: template.language },
    })
    .returning({ id: schema.messages.id });

  let externalId: string;
  try {
    ({ externalId } = await (deps.send ?? sendWhatsAppTemplate)({
      channelExternalId: channel.externalId,
      accessToken: decryptSecret(channel.accessTokenEncrypted),
      to: row.toId,
      name: template.name,
      language: template.language,
      bodyParams: params,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "পাঠানো যায়নি।";
    await db.update(schema.messages).set({ status: "failed", error: message }).where(eq(schema.messages.id, pending.id));
    publishInboxEvent({ type: "conversation", conversationId: conversation.id });
    return fail(message);
  }

  await db.update(schema.messages).set({ externalId, status: "sent" }).where(eq(schema.messages.id, pending.id));
  await db
    .update(schema.conversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: text.slice(0, 200),
      // A person stepping in silences the bot for this conversation. The 24h window is NOT reopened:
      // only the customer writing back does that.
      botPaused: true,
      needsHuman: false,
    })
    .where(eq(schema.conversations.id, conversation.id));

  publishInboxEvent({ type: "conversation", conversationId: conversation.id });
  return { ok: true, messageId: pending.id };
}
