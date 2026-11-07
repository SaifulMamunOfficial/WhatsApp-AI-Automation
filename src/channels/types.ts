// Channel-neutral types. Inbox, automation and AI code depend only on these;
// every channel-specific rule lives inside an adapter (src/channels/<name>/).

export type ChannelType = "whatsapp" | "messenger";

/** Where a message originated. Matches messages.source in the DB. */
export type MessageSource = "api" | "phone_app" | "page_inbox" | "history";

export type MessageDirection = "inbound" | "outbound";

export interface NormalizedMessage {
  channelType: ChannelType;
  /** Our channels.id (resolved from the webhook's phone_number_id / page id). */
  channelId: string;
  /** wamid (WhatsApp) or mid (Messenger). Unique; used for idempotency. */
  externalId: string;
  /** Customer identity on this channel: WhatsApp number (E.164) or Facebook PSID. */
  contactExternalId: string;
  contactName?: string;
  direction: MessageDirection;
  source: MessageSource;
  text?: string;
  /** Provider timestamp. */
  timestamp: Date;
  /** Raw provider payload for debugging; never shown to users. */
  raw?: unknown;
}

export interface SendTextInput {
  channelId: string;
  to: string;
  text: string;
  /** Messenger only: send outside the 24h window as a human agent. */
  humanAgent?: boolean;
}

export interface SendResult {
  externalId: string;
}

export interface ChannelAdapter {
  readonly type: ChannelType;
  /** Verify the webhook signature (X-Hub-Signature-256) over the raw body. */
  verifySignature(rawBody: string, signatureHeader: string | null): boolean;
  /** Parse a webhook payload into normalized messages. Must not throw on unknown events. */
  parseWebhook(payload: unknown): NormalizedMessage[];
  sendText(input: SendTextInput): Promise<SendResult>;
}
