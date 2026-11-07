// Channel-neutral types. Inbox, automation and AI code depend only on these;
// every channel-specific rule lives inside an adapter (src/channels/<name>/).

export type ChannelType = "whatsapp" | "messenger";

/** Where a message originated. Matches messages.source in the DB. */
export type MessageSource = "api" | "phone_app" | "page_inbox" | "history";

export type MessageDirection = "inbound" | "outbound";

export type DeliveryStatus = "sent" | "delivered" | "read" | "failed";

export interface NormalizedMessage {
  channelType: ChannelType;
  /** Provider id of our channel: WhatsApp phone_number_id / Facebook Page id. Maps to channels.external_id. */
  channelExternalId: string;
  /** wamid (WhatsApp) or mid (Messenger). Unique; used for idempotency. */
  externalId: string;
  /** Customer identity on this channel: WhatsApp number (digits) or Facebook PSID. */
  contactExternalId: string;
  contactName?: string;
  direction: MessageDirection;
  source: MessageSource;
  /** Provider message type, e.g. "text", "image", "audio", "unsupported". */
  type: string;
  /** Text, caption, or button/list reply title. Undefined for pure media. */
  text?: string;
  /** Provider timestamp. */
  timestamp: Date;
  /** Delivery state when the provider reports it with the message (history import). Defaults to "sent". */
  status?: DeliveryStatus | "pending";
  /** Raw provider message object for debugging; never shown to users. */
  raw?: unknown;
}

export interface StatusUpdate {
  channelType: ChannelType;
  channelExternalId: string;
  /** Id of the outbound message this status is about. */
  externalId: string;
  status: DeliveryStatus;
  timestamp: Date;
  error?: string;
}

/** One thread of a WhatsApp Coexistence history chunk (a past 1:1 chat). */
export interface HistoryThread {
  /** The customer: phone number, or business-scoped user id when the number is hidden. */
  contactExternalId: string;
  contactName?: string;
  messages: NormalizedMessage[];
}

/**
 * A piece of the one-time history import. Chunks can arrive out of order and in several
 * phases (0: day 0-1, 1: day 1-90, 2: day 90-180); progress 100 means the import is done.
 */
export interface HistoryChunk {
  channelType: ChannelType;
  channelExternalId: string;
  phase: number;
  chunkOrder: number;
  progress: number;
  threads: HistoryThread[];
  /** Set when the business declined to share history (Meta error 2593109) or Meta reported a failure. */
  error?: { code?: number; message: string; declined: boolean };
}

/** A contact added/removed in the WhatsApp Business App on the phone (Coexistence state sync). */
export interface ContactSyncEvent {
  channelType: ChannelType;
  channelExternalId: string;
  action: "add" | "remove";
  contactExternalId: string;
  fullName?: string;
  firstName?: string;
  timestamp: Date;
}

export interface WebhookEvents {
  messages: NormalizedMessage[];
  statuses: StatusUpdate[];
  /** Present only for WhatsApp Coexistence webhooks. */
  history?: HistoryChunk[];
  contactSync?: ContactSyncEvent[];
}

export interface SendTextInput {
  /** Provider id of our channel (phone_number_id / Page id). */
  channelExternalId: string;
  /** Decrypted access token. Never log it. */
  accessToken: string;
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
  /** Parse a webhook payload. Must not throw on unknown events; returns nothing for them. */
  parseWebhook(payload: unknown): WebhookEvents;
  sendText(input: SendTextInput): Promise<SendResult>;
}
