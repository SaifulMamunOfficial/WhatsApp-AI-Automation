import { verifyMetaSignature } from "../meta-signature";
import type { ChannelAdapter, SendResult, SendTextInput, WebhookEvents } from "../types";
import { parseWhatsAppWebhook } from "./parser";
import { sendWhatsAppText } from "./sender";

export const whatsappAdapter: ChannelAdapter = {
  type: "whatsapp",
  verifySignature(rawBody: string, signatureHeader: string | null): boolean {
    return verifyMetaSignature(rawBody, signatureHeader, process.env.META_APP_SECRET);
  },
  parseWebhook(payload: unknown): WebhookEvents {
    return parseWhatsAppWebhook(payload);
  },
  sendText(input: SendTextInput): Promise<SendResult> {
    return sendWhatsAppText(input);
  },
};
