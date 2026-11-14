import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { backoffMs, claimNext, cleanupJobs, complete, enqueue, fail, LOCK_TIMEOUT_MS, queueSummary, runOnce } from "@/core/jobs/queue";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());
beforeEach(async () => {
  await t.db.delete(schema.jobs);
});

const T0 = new Date("2026-03-10T08:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const row = async (id: string) => (await t.db.select().from(schema.jobs).where(eq(schema.jobs.id, id)))[0];

describe("backoff", () => {
  it("doubles from 10 seconds up to 10 minutes", () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([10_000, 20_000, 40_000, 80_000]);
    expect(backoffMs(20)).toBe(600_000);
  });
});

describe("claiming", () => {
  it("takes the oldest due job of the wanted queues and counts the attempt", async () => {
    const later = await enqueue(t.db, "a", { n: 2 }, { runAt: at(1000) });
    const first = await enqueue(t.db, "a", { n: 1 }, { runAt: at(0) });
    await enqueue(t.db, "other", {}, { runAt: at(0) });
    const job = await claimNext(t.db, ["a"], at(2000));
    expect(job).toMatchObject({ id: first, queue: "a", payload: { n: 1 }, attempts: 1 });
    expect((await row(first)).status).toBe("running");
    expect((await claimNext(t.db, ["a"], at(2000)))?.id).toBe(later);
    expect(await claimNext(t.db, ["a"], at(2000))).toBeNull();
    expect((await t.db.select().from(schema.jobs).where(eq(schema.jobs.queue, "other")))[0].status).toBe("queued");
  });

  it("does not take a job before its time or with no queues", async () => {
    await enqueue(t.db, "a", {}, { runAt: at(60_000) });
    expect(await claimNext(t.db, ["a"], at(0))).toBeNull();
    expect(await claimNext(t.db, [], at(120_000))).toBeNull();
    expect(await claimNext(t.db, ["a"], at(120_000))).not.toBeNull();
  });

  it("two workers never get the same job", async () => {
    await enqueue(t.db, "a", {}, { runAt: at(0) });
    const [x, y] = await Promise.all([claimNext(t.db, ["a"], at(1)), claimNext(t.db, ["a"], at(1))]);
    expect([x, y].filter(Boolean)).toHaveLength(1);
  });

  it("takes a job back from a crashed worker after the lock timeout", async () => {
    const id = await enqueue(t.db, "a", {}, { runAt: at(0) });
    await claimNext(t.db, ["a"], at(0));
    expect(await claimNext(t.db, ["a"], at(LOCK_TIMEOUT_MS - 1000))).toBeNull(); // still being worked on
    const again = await claimNext(t.db, ["a"], at(LOCK_TIMEOUT_MS + 1000));
    expect(again).toMatchObject({ id, attempts: 2 });
  });

  it("a crashed job with no attempts left is marked failed instead of run again", async () => {
    const id = await enqueue(t.db, "a", {}, { runAt: at(0), maxAttempts: 1 });
    await claimNext(t.db, ["a"], at(0));
    expect(await claimNext(t.db, ["a"], at(LOCK_TIMEOUT_MS + 1000))).toBeNull();
    expect(await row(id)).toMatchObject({ status: "failed" });
  });
});

describe("finishing", () => {
  it("complete marks it done and clears the lock", async () => {
    const id = await enqueue(t.db, "a", {});
    await claimNext(t.db, ["a"], at(0));
    await complete(t.db, id, at(5));
    expect(await row(id)).toMatchObject({ status: "done", lockedAt: null, lastError: null });
  });

  it("a failure is retried later with a growing delay, then given up after max attempts", async () => {
    const id = await enqueue(t.db, "a", {}, { runAt: at(0), maxAttempts: 2 });
    const first = (await claimNext(t.db, ["a"], at(0)))!;
    expect(await fail(t.db, first, new Error("boom"), at(0))).toBe("retry");
    expect(await row(id)).toMatchObject({ status: "queued", lastError: "boom" });
    expect(await claimNext(t.db, ["a"], at(5_000))).toBeNull(); // not before 10s
    const second = (await claimNext(t.db, ["a"], at(11_000)))!;
    expect(second.attempts).toBe(2);
    expect(await fail(t.db, second, new Error("boom again"), at(11_000))).toBe("failed");
    expect(await row(id)).toMatchObject({ status: "failed", lastError: "boom again" });
    expect(await claimNext(t.db, ["a"], at(10 * 60_000))).toBeNull();
  });
});

describe("runOnce", () => {
  it("runs the handler for the job's queue and completes it", async () => {
    const id = await enqueue(t.db, "greet", { name: "Rina" }, { runAt: at(0) });
    const seen: unknown[] = [];
    const did = await runOnce(t.db, { greet: async (p) => void seen.push(p) }, () => at(0));
    expect(did).toBe(true);
    expect(seen).toEqual([{ name: "Rina" }]);
    expect((await row(id)).status).toBe("done");
    expect(await runOnce(t.db, { greet: async () => {} }, () => at(0))).toBe(false);
  });

  it("only runs queues it has a handler for", async () => {
    await enqueue(t.db, "unknown", {});
    expect(await runOnce(t.db, { greet: async () => {} }, () => at(0))).toBe(false);
  });

  it("a throwing handler leaves the job to be retried and logs, without throwing", async () => {
    const id = await enqueue(t.db, "bad", {}, { runAt: at(0) });
    const log = vi.fn();
    expect(await runOnce(t.db, { bad: async () => { throw new Error("nope"); } }, () => at(0), log)).toBe(true);
    expect(await row(id)).toMatchObject({ status: "queued", attempts: 1, lastError: "nope" });
    expect(log).toHaveBeenCalled();
  });

  it("survives a 'restart': a job claimed but never finished runs again later", async () => {
    const id = await enqueue(t.db, "a", { k: 1 }, { runAt: at(0) });
    await claimNext(t.db, ["a"], at(0)); // the process dies here
    const seen: unknown[] = [];
    expect(await runOnce(t.db, { a: async (p) => void seen.push(p) }, () => at(LOCK_TIMEOUT_MS + 5000))).toBe(true);
    expect(seen).toEqual([{ k: 1 }]);
    expect((await row(id)).status).toBe("done");
  });
});

describe("cleanup and summary", () => {
  it("deletes old finished jobs, keeps recent ones and keeps failed ones longer", async () => {
    const old = await enqueue(t.db, "a", {});
    const recent = await enqueue(t.db, "a", {});
    const oldFailed = await enqueue(t.db, "a", {});
    await t.db.update(schema.jobs).set({ status: "done", finishedAt: new Date("2026-02-01T00:00:00Z") }).where(eq(schema.jobs.id, old));
    await t.db.update(schema.jobs).set({ status: "done", finishedAt: new Date("2026-03-09T00:00:00Z") }).where(eq(schema.jobs.id, recent));
    await t.db.update(schema.jobs).set({ status: "failed", finishedAt: new Date("2026-02-20T00:00:00Z") }).where(eq(schema.jobs.id, oldFailed));
    expect(await cleanupJobs(t.db, new Date("2026-03-10T00:00:00Z"))).toBe(1);
    expect((await t.db.select().from(schema.jobs)).map((r) => r.id).sort()).toEqual([recent, oldFailed].sort());
  });

  it("summarises counts and the latest failures", async () => {
    await enqueue(t.db, "a", {});
    const bad = await enqueue(t.db, "media", {}, { maxAttempts: 1 });
    const job = (await claimNext(t.db, ["media"]))!;
    await fail(t.db, job, new Error("HTTP 400"));
    const s = await queueSummary(t.db);
    expect(s).toMatchObject({ queued: 1, running: 0, failed: 1 });
    expect(s.recentFailures[0]).toMatchObject({ id: bad, queue: "media", error: "HTTP 400" });
  });
});
