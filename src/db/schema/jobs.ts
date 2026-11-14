import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed"]);

// A small durable work queue kept in Postgres: work that must not be lost when the server restarts
// (bot replies, AI answers, file downloads). The webhook only inserts a row and answers Meta; a
// worker inside the app picks rows up, retries with a growing delay, and gives up after max_attempts.
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queue: text("queue").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    // Not before this time (also how a retry is delayed).
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    // Set while running; a job "running" for too long is assumed lost in a crash and is taken again.
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("jobs_pick_idx").on(t.status, t.runAt)],
);
