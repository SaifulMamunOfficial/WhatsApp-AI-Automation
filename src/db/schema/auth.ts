import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Placeholder table so the migration pipeline can be verified end to end.
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRole = pgEnum("user_role", ["admin", "agent"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Always stored lowercase (normalized in code).
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("agent"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Database sessions. The cookie holds a random token; only its SHA-256 hash is stored,
// so a database leak does not expose usable session tokens.
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
