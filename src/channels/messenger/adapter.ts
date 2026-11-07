import { verifyMetaSignature } from "../meta-signature";
import type { ChannelAdapter, SendResult, SendTextInput, WebhookEvents } from "../types";
import { parseMessengerWebhook } from "./parser";
import { sendMessengerText } from "./sender";

export const messengerAdapter: ChannelAdapter = {
  type: "messenger",
  verifySignature(rawBody: string, signatureHeader: string | null): boolean {
    return verifyMetaSignature(rawBody, signatureHeader, process.env.META_APP_SECRET);
  },
  parseWebhook(payload: unknown): WebhookEvents {
    return parseMessengerWebhook(payload, { ownAppId: process.env.META_APP_ID });
  },
  sendText(input: SendTextInput): Promise<SendResult> {
    return sendMessengerText(input);
  },
};
