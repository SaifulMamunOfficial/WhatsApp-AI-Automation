import { boolean, index, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { channels } from "./channels";

// One real person. May have several identities (WhatsApp number, Facebook PSID).
export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  notes: text("notes"),
  // Explicit consent to receive marketing/broadcast messages. Broadcasts go ONLY to opted-in contacts.
  optedIn: boolean("opted_in").notNull().default(false),
  optedInAt: timestamp("opted_in_at", { withTimezone: true }),
  // How consent was obtained/changed: "manual", "csv_import", "customer_stop", ...
  optInSource: text("opt_in_source"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// How a contact is known on one channel. A Facebook PSID is page-scoped, so
// identities are unique per (channel, external id).
export const contactIdentities = pgTable(
  "contact_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    // WhatsApp number (digits, E.164 without +) or Facebook PSID.
    externalId: text("external_id").notNull(),
    // Name as reported by the channel (WhatsApp profile name, Facebook name).
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("contact_identities_channel_external_unique").on(t.channelId, t.externalId),
    index("contact_identities_contact_idx").on(t.contactId),
  ],
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  color: text("color"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.tagId] })],
);
