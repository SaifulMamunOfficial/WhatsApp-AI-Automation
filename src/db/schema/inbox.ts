import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { channels } from "./channels";
import { contactIdentities, contacts } from "./contacts";

export const conversationStatus = pgEnum("conversation_status", ["open", "closed"]);
export const messageDirection = pgEnum("message_direction", ["inbound", "outbound"]);
// api: sent via Cloud API / Send API. phone_app: sent from the WhatsApp Business App (echo).
// page_inbox: sent from the Facebook Page inbox (echo). history: imported past chat.
export const messageSource = pgEnum("message_source", ["api", "phone_app", "page_inbox", "history"]);
export const messageStatus = pgEnum("message_status", ["pending", "sent", "delivered", "read", "failed"]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    identityId: uuid("identity_id")
      .notNull()
      .references(() => contactIdentities.id, { onDelete: "cascade" }),
    status: conversationStatus("status").notNull().default("open"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    // Set when a human replies (phone/page echo or CRM agent); the bot stays silent until cleared.
    botPaused: boolean("bot_paused").notNull().default(false),
    // The bot could not help (AI handoff / provider failure): a person must answer. Cleared when one does.
    needsHuman: boolean("needs_human").notNull().default(false),
    // Start of the 24h reply window (bot may answer; templates/human tag needed after).
    lastCustomerMessageAt: timestamp("last_customer_message_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessagePreview: text("last_message_preview"),
    unreadCount: integer("unread_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("conversations_channel_identity_unique").on(t.channelId, t.identityId),
    index("conversations_last_message_idx").on(t.lastMessageAt),
    index("conversations_assigned_idx").on(t.assignedUserId),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    // wamid (WhatsApp) or mid (Messenger). Unique => duplicate webhook deliveries are dropped.
    // Null only for an outbound message not yet accepted by the provider.
    externalId: text("external_id").unique(),
    direction: messageDirection("direction").notNull(),
    source: messageSource("source").notNull(),
    // "text" for now; "image", "audio", "template", ... later.
    type: text("type").notNull().default("text"),
    body: text("body"),
    status: messageStatus("status").notNull().default("sent"),
    error: text("error"),
    // CRM agent who sent it (null for customer, bot, phone/page-inbox messages).
    sentByUserId: uuid("sent_by_user_id").references(() => users.id, { onDelete: "set null" }),
    sentByBot: boolean("sent_by_bot").notNull().default(false),
    // Provider timestamp, used for ordering and history import.
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_sent_idx").on(t.conversationId, t.sentAt)],
);

// Internal notes visible to staff only; never sent to the customer.
export const conversationNotes = pgTable(
  "conversation_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversation_notes_conversation_idx").on(t.conversationId)],
);
