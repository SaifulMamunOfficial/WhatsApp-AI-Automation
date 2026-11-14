import { and, asc, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";

// A durable work queue on Postgres. Pure database logic: the worker loop that calls it is in worker.ts.
//
//  enqueue     insert a row (this is all a webhook has to do before answering Meta)
//  claimNext   atomically take ONE due job (FOR UPDATE SKIP LOCKED: two workers never get the same one)
//  complete    mark it done
//  fail        retry later with a growing delay, or give up after max_attempts
//
// A job that stays "running" longer than LOCK_TIMEOUT_MS belongs to a process that crashed; it is
// taken again (counted as an attempt), so a server restart never loses work.

export interface Job {
  id: string;
  queue: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_ATTEMPTS = 5;
export const KEEP_DONE_DAYS = 7;
export const KEEP_FAILED_DAYS = 30;

const j = schema.jobs;

/** Delay before the next try: 10s, 20s, 40s ... capped at 10 minutes. `attempts` = tries made so far. */
export function backoffMs(attempts: number): number {
  return Math.min(10_000 * 2 ** Math.max(0, attempts - 1), 10 * 60 * 1000);
}

export async function enqueue(db: Db, queue: string, payload: unknown, opts: { runAt?: Date; maxAttempts?: number } = {}): Promise<string> {
  const [row] = await db
    .insert(j)
    .values({ queue, payload: payload ?? {}, runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS })
    .returning({ id: j.id });
  return row.id;
}

/** Takes the oldest due job of the given queues, or null. */
export async function claimNext(db: Db, queues: string[], now = new Date(), lockTimeoutMs = LOCK_TIMEOUT_MS): Promise<Job | null> {
  if (queues.length === 0) return null;
  const staleBefore = new Date(now.getTime() - lockTimeoutMs);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(j)
      .where(and(inArray(j.queue, queues), or(and(eq(j.status, "queued"), lte(j.runAt, now)), and(eq(j.status, "running"), lt(j.lockedAt, staleBefore)))))
      .orderBy(asc(j.runAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!row) return null;

    // A crashed job that already used all its attempts is finished, not run again.
    if (row.status === "running" && row.attempts >= row.maxAttempts) {
      await tx.update(j).set({ status: "failed", finishedAt: now, lastError: row.lastError ?? "server stopped while running this job" }).where(eq(j.id, row.id));
      return null;
    }

    await tx.update(j).set({ status: "running", lockedAt: now, attempts: sql`${j.attempts} + 1` }).where(eq(j.id, row.id));
    return { id: row.id, queue: row.queue, payload: row.payload, attempts: row.attempts + 1, maxAttempts: row.maxAttempts };
  });
}

export async function complete(db: Db, id: string, now = new Date()): Promise<void> {
  await db.update(j).set({ status: "done", lockedAt: null, finishedAt: now, lastError: null }).where(eq(j.id, id));
}

/** Retry later (growing delay) or, after the last attempt, give up. Returns what happened. */
export async function fail(db: Db, job: Job, error: unknown, now = new Date()): Promise<"retry" | "failed"> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  if (job.attempts >= job.maxAttempts) {
    await db.update(j).set({ status: "failed", lockedAt: null, finishedAt: now, lastError: message }).where(eq(j.id, job.id));
    return "failed";
  }
  await db
    .update(j)
    .set({ status: "queued", lockedAt: null, runAt: new Date(now.getTime() + backoffMs(job.attempts)), lastError: message })
    .where(eq(j.id, job.id));
  return "retry";
}

export type Handlers = Record<string, (payload: unknown, job: Job) => Promise<void>>;

/** Claims and runs one job. Returns false when nothing was due. A handler that throws is retried. */
export async function runOnce(db: Db, handlers: Handlers, now: () => Date = () => new Date(), log: (msg: string, err?: unknown) => void = () => {}): Promise<boolean> {
  const job = await claimNext(db, Object.keys(handlers), now());
  if (!job) return false;
  try {
    await handlers[job.queue](job.payload, job);
    await complete(db, job.id, now());
  } catch (err) {
    const outcome = await fail(db, job, err, now());
    log(`job ${job.queue} ${outcome === "retry" ? "will be retried" : "gave up"} (attempt ${job.attempts}/${job.maxAttempts})`, err instanceof Error ? err.message : err);
  }
  return true;
}

/** Old finished jobs are deleted; failed ones are kept longer so they can be looked at. */
export async function cleanupJobs(db: Db, now = new Date()): Promise<number> {
  const doneBefore = new Date(now.getTime() - KEEP_DONE_DAYS * 86_400_000);
  const failedBefore = new Date(now.getTime() - KEEP_FAILED_DAYS * 86_400_000);
  const a = await db.delete(j).where(and(eq(j.status, "done"), lt(j.finishedAt, doneBefore))).returning({ id: j.id });
  const b = await db.delete(j).where(and(eq(j.status, "failed"), lt(j.finishedAt, failedBefore))).returning({ id: j.id });
  return a.length + b.length;
}

export interface QueueSummary {
  queued: number;
  running: number;
  failed: number;
  recentFailures: { id: string; queue: string; error: string | null; finishedAt: Date | null }[];
}

export async function queueSummary(db: Db): Promise<QueueSummary> {
  const rows = await db.select({ status: j.status, n: sql<number>`count(*)::int` }).from(j).groupBy(j.status);
  const count = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  const recent = await db
    .select({ id: j.id, queue: j.queue, error: j.lastError, finishedAt: j.finishedAt })
    .from(j)
    .where(eq(j.status, "failed"))
    .orderBy(sql`${j.finishedAt} desc nulls last`)
    .limit(5);
  return { queued: count("queued"), running: count("running"), failed: count("failed"), recentFailures: recent.map((r) => ({ id: r.id, queue: r.queue, error: r.error, finishedAt: r.finishedAt })) };
}
