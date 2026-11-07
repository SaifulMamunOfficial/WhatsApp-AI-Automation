import { boolean, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const channelType = pgEnum("channel_type", ["whatsapp", "messenger"]);
export const channelStatus = pgEnum("channel_status", ["pending", "active", "disconnected"]);

// One row per WhatsApp number and per Facebook Page.
export const channels = pgTable(
  "channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: channelType("type").notNull(),
    name: text("name").notNull(),
    // WhatsApp: phone_number_id. Messenger: Facebook Page id. Webhooks are routed by this.
    externalId: text("external_id").notNull(),
    // WhatsApp: WhatsApp Business Account id. Null for Messenger.
    wabaId: text("waba_id"),
    // Human-readable number for WhatsApp (display only).
    displayPhone: text("display_phone"),
    // AES-256-GCM ciphertext (see src/lib/crypto.ts). Never store a plaintext token.
    accessTokenEncrypted: text("access_token_encrypted"),
    status: channelStatus("status").notNull().default("pending"),
    // Development channels (Meta test number / test page). Real channels must be false.
    isTest: boolean("is_test").notNull().default(false),
    // Master switch for bots on this channel (go-live: start with bots off).
    botEnabled: boolean("bot_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("channels_type_external_id_unique").on(t.type, t.externalId)],
);
