import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { ingestEvents } from "@/core/inbox/ingest";
import { AUTOMATION_QUEUE, automationHandler, botAlreadyReplied, MEDIA_QUEUE, mediaHandler } from "@/core/jobs/handlers";
import { enqueue, runOnce } from "@/core/jobs/queue";
import type { NormalizedMessage } from "@/channels/types";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
const NOW = new Date("2026-03-10T08:00:00Z"); // 14:00 Dhaka

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "d".repeat(64);
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());

beforeEach(async () => {
  await t.db.delete(schema.jobs);
  await t.db.delete(schema.automations);
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.channels);
  await t.db.insert(schema.channels).values({ type: "whatsapp", name: "WA", externalId: "PNID", status: "active", accessTokenEncrypted: encryptSecret("TOK"), isTest: true, botEnabled: true });
  await t.db.insert(schema.automations).values({ kind: "welcome", name: "স্বাগতম", priority: 10, config: { text: "স্বাগতম!" } });
});

const inbound = (id: string): NormalizedMessage => ({
  channelType: "whatsapp",
  channelExternalId: "PNID",
  externalId: id,
  contactExternalId: "8801711111111",
  contactName: "Rahim",
  direction: "inbound",
  source: "api",
  type: "text",
  text: "hello",
  timestamp: new Date(NOW.getTime() - 60_000),
});

function setup() {
  const send = vi.fn(async (...args: unknown[]) => ({ externalId: `bot-${args.length}-${Math.random()}` }));
  const deps = { send: { adapterFor: () => ({ sendText: send }), now: () => NOW }, now: () => NOW, office: { tz: "Asia/Dhaka", open: "10:00", close: "22:00" } };
  return { send, deps };
}

describe("automation job", () => {
  it("answers the customer message once, even if the same job runs again after a crash", async () => {
    const r = await ingestEvents(t.db, { messages: [inbound("w-1")], statuses: [] });
    const { send, deps } = setup();
    const handlers = { [AUTOMATION_QUEUE]: automationHandler(t.db, deps, () => {}) };

    await enqueue(t.db, AUTOMATION_QUEUE, r.newInbound[0], { runAt: NOW });
    expect(await runOnce(t.db, handlers, () => NOW)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ text: "স্বাগতম!" });

    // the job "ran again" (e.g. the process died before it was marked done): no second reply
    await enqueue(t.db, AUTOMATION_QUEUE, r.newInbound[0], { runAt: NOW });
    expect(await runOnce(t.db, handlers, () => NOW)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("ignores a malformed payload instead of retrying forever", async () => {
    const { send, deps } = setup();
    const id = await enqueue(t.db, AUTOMATION_QUEUE, { nonsense: true }, { runAt: NOW });
    await runOnce(t.db, { [AUTOMATION_QUEUE]: automationHandler(t.db, deps, () => {}) }, () => NOW);
    expect(send).not.toHaveBeenCalled();
    expect((await t.db.select().from(schema.jobs).where(eq(schema.jobs.id, id)))[0].status).toBe("done");
  });

  it("a database error inside the run makes the job retry (it is not silently dropped)", async () => {
    const r = await ingestEvents(t.db, { messages: [inbound("w-2")], statuses: [] });
    const { deps } = setup();
    const broken = { ...t.db, select: () => { throw new Error("connection lost"); } } as unknown as typeof t.db;
    const id = await enqueue(t.db, AUTOMATION_QUEUE, r.newInbound[0], { runAt: NOW });
    await runOnce(t.db, { [AUTOMATION_QUEUE]: automationHandler(broken, deps, () => {}) }, () => NOW);
    const job = (await t.db.select().from(schema.jobs).where(eq(schema.jobs.id, id)))[0];
    expect(job).toMatchObject({ status: "queued", attempts: 1, lastError: "connection lost" });
  });
});

describe("botAlreadyReplied", () => {
  it("is true only when a bot message exists at or after the customer's message", async () => {
    const r = await ingestEvents(t.db, { messages: [inbound("w-3")], statuses: [] });
    const { conversationId } = r.newInbound[0];
    expect(await botAlreadyReplied(t.db, conversationId, "w-3")).toBe(false);
    const [ch] = await t.db.select().from(schema.channels);
    await t.db.insert(schema.messages).values({ conversationId, channelId: ch.id, direction: "outbound", source: "api", type: "text", body: "bot", sentByBot: true, sentAt: NOW });
    expect(await botAlreadyReplied(t.db, conversationId, "w-3")).toBe(true);
    expect(await botAlreadyReplied(t.db, conversationId, "unknown")).toBe(false);
  });
});

describe("media job", () => {
  it("finishes when the file is ready or already handled, retries when the download failed", async () => {
    const ok = mediaHandler(async () => "ready");
    const skipped = mediaHandler(async () => "skipped");
    const bad = mediaHandler(async () => "failed");
    const id = "11111111-1111-4111-8111-111111111111";
    await expect(ok({ mediaId: id })).resolves.toBeUndefined();
    await expect(skipped({ mediaId: id })).resolves.toBeUndefined();
    await expect(bad({ mediaId: id })).rejects.toThrow("media download failed");
    await expect(bad({ nope: 1 })).resolves.toBeUndefined(); // malformed payload: nothing to retry
  });

  it("a failed download is retried by the queue and finally given up after max attempts", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const job = await enqueue(t.db, MEDIA_QUEUE, { mediaId: id }, { runAt: NOW, maxAttempts: 2 });
    const handlers = { [MEDIA_QUEUE]: mediaHandler(async () => "failed") };
    await runOnce(t.db, handlers, () => NOW);
    expect((await t.db.select().from(schema.jobs).where(eq(schema.jobs.id, job)))[0]).toMatchObject({ status: "queued", attempts: 1 });
    await runOnce(t.db, handlers, () => new Date(NOW.getTime() + 60_000));
    expect((await t.db.select().from(schema.jobs).where(eq(schema.jobs.id, job)))[0]).toMatchObject({ status: "failed", attempts: 2 });
  });
});

describe("enqueueIngestWork (what a webhook writes to the queue)", () => {
  it("makes one job per new customer message and per new file, with the right retry limits", async () => {
    const { enqueueIngestWork } = await import("@/core/jobs/enqueue");
    const n = await enqueueIngestWork(t.db, {
      newInbound: [{ conversationId: "11111111-1111-4111-8111-111111111111", messageExternalId: "m1" }, { conversationId: "11111111-1111-4111-8111-111111111111", messageExternalId: "m2" }],
      newMedia: ["22222222-2222-4222-8222-222222222222"],
    });
    expect(n).toBe(3);
    const all = await t.db.select().from(schema.jobs);
    expect(all.filter((j) => j.queue === AUTOMATION_QUEUE).map((j) => (j.payload as { messageExternalId: string }).messageExternalId).sort()).toEqual(["m1", "m2"]);
    const media = all.find((j) => j.queue === MEDIA_QUEUE)!;
    expect(media).toMatchObject({ status: "queued", maxAttempts: 3, payload: { mediaId: "22222222-2222-4222-8222-222222222222" } });
    expect(await enqueueIngestWork(t.db, { newInbound: [], newMedia: [] })).toBe(0);
  });
});
