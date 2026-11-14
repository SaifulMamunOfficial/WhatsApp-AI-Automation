import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { channels } from "./channels";

export const automationKind = pgEnum("automation_kind", ["welcome", "keyword", "office_hours", "ai"]);
export const templateStatus = pgEnum("template_status", ["draft", "pending", "approved", "rejected", "paused"]);

// Welcome message, keyword menu entries, out-of-office auto-reply.
// `config` holds the kind-specific settings (keywords, reply text, ...); its shape is
// validated in code (src/core/automation), not in the database.
export const automations = pgTable(
  "automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: automationKind("kind").notNull(),
    name: text("name").notNull(),
    // Null = applies to every channel.
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    // Lower runs first when several keyword rules could match.
    priority: integer("priority").notNull().default(100),
    config: jsonb("config").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("automations_kind_idx").on(t.kind, t.enabled)],
);

// WhatsApp message templates (broadcast and messages after the 24h window).
export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    language: text("language").notNull(),
    category: text("category").notNull(),
    status: templateStatus("status").notNull().default("draft"),
    // Meta's template id once submitted.
    metaTemplateId: text("meta_template_id"),
    components: jsonb("components").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("templates_channel_name_language_unique").on(t.channelId, t.name, t.language)],
);

// Q&A / articles the AI bot answers from.
export const knowledgeBase = pgTable("knowledge_base", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// API keys for the AI bot, one row per provider ("anthropic" | "openai" | "gemini"). The key is
// AES-256-GCM encrypted (src/lib/crypto.ts) and never sent back to the browser. At most one row is
// `active`; when none has a key the server's .env keys are the fallback.
export const aiProviderSettings = pgTable("ai_provider_settings", {
  provider: text("provider").primaryKey(),
  apiKeyEncrypted: text("api_key_encrypted"),
  model: text("model"),
  active: boolean("active").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Days the office is closed (Eid, national holidays...). While a holiday is active the bot sends
// its message instead of the after-hours notice and the welcome message (keyword answers and AI
// answers still work). Dates are calendar days in the office time zone (Asia/Dhaka), inclusive.
export const holidays = pgTable("holidays", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  text: text("text").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
