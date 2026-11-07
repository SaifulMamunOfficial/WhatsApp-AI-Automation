import { boolean, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const channelType = pgEnum("channel_type", ["whatsapp", "messenger"]);
export const channelStatus = pgEnum("channel_status", ["pending", "active", "disconnected"]);
export const historySyncStatus = pgEnum("history_sync_status", [
  "not_requested",
  "requested",
  "in_progress",
  "complete",
  "declined",
  "failed",
]);

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

// WhatsApp Coexistence onboarding state. Meta allows each sync to be requested ONCE per
// onboarding (within 24h of it); a second request needs offboarding and a new signup.
// So we record when each request was made and never repeat it.
export const whatsappSyncState = pgTable("whatsapp_sync_state", {
  channelId: uuid("channel_id")
    .primaryKey()
    .references(() => channels.id, { onDelete: "cascade" }),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }).notNull().defaultNow(),
  contactsRequestedAt: timestamp("contacts_requested_at", { withTimezone: true }),
  contactsRequestId: text("contacts_request_id"),
  historyRequestedAt: timestamp("history_requested_at", { withTimezone: true }),
  historyRequestId: text("history_request_id"),
  historyStatus: historySyncStatus("history_status").notNull().default("not_requested"),
  // 0-100, as reported by Meta in history chunks.
  historyProgress: integer("history_progress").notNull().default(0),
  historyMessageCount: integer("history_message_count").notNull().default(0),
  contactsSyncedCount: integer("contacts_synced_count").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
