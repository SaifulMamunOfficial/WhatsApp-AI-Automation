import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { templates } from "./automation";
import { channels } from "./channels";
import { contactIdentities, contacts, tags } from "./contacts";

export const broadcastStatus = pgEnum("broadcast_status", ["draft", "sending", "paused", "completed", "cancelled"]);
export const recipientStatus = pgEnum("recipient_status", ["pending", "sending", "sent", "failed", "skipped"]);

// A WhatsApp template broadcast. The recipient list is frozen when the broadcast is created
// (so the confirmation screen shows exactly who will be messaged) and sending is resumable:
// every recipient is a row, so a crash or restart never loses or duplicates progress.
export const broadcasts = pgTable("broadcasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  templateId: uuid("template_id")
    .notNull()
    .references(() => templates.id, { onDelete: "restrict" }),
  // Optional: only contacts with this tag.
  tagId: uuid("tag_id").references(() => tags.id, { onDelete: "set null" }),
  // Template variable values, in order ({{1}}, {{2}}, ...): [{ kind: "fixed", value } | { kind: "first_name", fallback }]
  params: jsonb("params").notNull().default([]),
  status: broadcastStatus("status").notNull().default("draft"),
  pauseReason: text("pause_reason"),
  totalCount: integer("total_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const broadcastRecipients = pgTable(
  "broadcast_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    broadcastId: uuid("broadcast_id")
      .notNull()
      .references(() => broadcasts.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    identityId: uuid("identity_id")
      .notNull()
      .references(() => contactIdentities.id, { onDelete: "cascade" }),
    // The WhatsApp number at the time of creation.
    toNumber: text("to_number").notNull(),
    status: recipientStatus("status").notNull().default("pending"),
    // wamid once sent.
    externalId: text("external_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    unique("broadcast_recipients_broadcast_contact_unique").on(t.broadcastId, t.contactId),
    index("broadcast_recipients_status_idx").on(t.broadcastId, t.status),
  ],
);
