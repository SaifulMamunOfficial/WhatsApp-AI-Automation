import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { ingestEvents } from "@/core/inbox/ingest";
import { processNewInbound, runAutomationForMessage, type RunDeps } from "@/core/automation/run";
import type { NormalizedMessage } from "@/channels/types";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;

const OPEN_NOW = new Date("2026-03-10T08:00:00Z"); // 14:00 Dhaka
const CLOSED_NOW = new Date("2026-03-10T20:00:00Z"); // 02:00 Dhaka

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "f".repeat(64);
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());

beforeEach(async () => {
  await t.db.delete(schema.automations);
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.channels);
  await t.db
    .insert(schema.channels)
    .values({ type: "whatsapp", name: "WA", externalId: "PNID", status: "active", accessTokenEncrypted: encryptSecret("TOK"), isTest: true, botEnabled: true });
  await t.db.insert(schema.automations).values([
    { kind: "welcome", name: "স্বাগতম", priority: 10, config: { text: "স্বাগতম! মেনু দেখতে 'menu' লিখুন।" } },
    { kind: "keyword", name: "মূল্য", priority: 20, config: { keywords: ["1", "মূল্য"], match: "contains", reply: "ফি ৫০০০ টাকা" } },
    { kind: "office_hours", name: "অফিস", priority: 30, config: { text: "এখন অফিস বন্ধ, সকাল ১০টায় উত্তর দেব।" } },
  ]);
});

const inbound = (over: Partial<NormalizedMessage> = {}, now = OPEN_NOW): NormalizedMessage => ({
  channelType: "whatsapp",
  channelExternalId: "PNID",
  externalId: `in-${Math.random()}`,
  contactExternalId: "8801711111111",
  contactName: "Rahim",
  direction: "inbound",
  source: "api",
  type: "text",
  text: "hello",
  timestamp: new Date(now.getTime() - 60_000),
  ...over,
});

function setup(now = OPEN_NOW) {
  const send = vi.fn().mockImplementation(async () => ({ externalId: `bot-${Math.random()}` }));
  const deps: RunDeps = { send: { adapterFor: () => ({ sendText: send }), now: () => now }, now: () => now, office: { tz: "Asia/Dhaka", open: "10:00", close: "22:00" } };
  const receive = async (m: NormalizedMessage) => {
    const r = await ingestEvents(t.db, { messages: [m], statuses: [] });
    await processNewInbound(t.db, deps, r.newInbound);
    return r;
  };
  return { send, deps, receive };
}
const conv = async () => (await t.db.select().from(schema.conversations))[0];

describe("automation runner", () => {
  it("welcomes a new customer once, then stays quiet for ordinary follow-ups", async () => {
    const { send, receive } = setup();
    await receive(inbound({ text: "hello" }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ text: "স্বাগতম! মেনু দেখতে 'menu' লিখুন।", to: "8801711111111", accessToken: "TOK", humanAgent: false });

    await receive(inbound({ text: "okay" }));
    expect(send).toHaveBeenCalledTimes(1);

    const [botMsg] = await t.db.select().from(schema.messages).where(eq(schema.messages.sentByBot, true));
    expect(botMsg).toMatchObject({ direction: "outbound", source: "api", status: "sent" });
    expect((await conv()).botPaused).toBe(false); // a bot reply never pauses the bot
  });

  it("answers a keyword (Bengali digit) instead of the welcome", async () => {
    const { send, receive } = setup();
    await receive(inbound({ text: "১" }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].text).toBe("ফি ৫০০০ টাকা");
  });

  it("does nothing when the channel's bot is switched off", async () => {
    await t.db.update(schema.channels).set({ botEnabled: false });
    const { send, receive } = setup();
    await receive(inbound({ text: "1" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("stays silent after a human replied from the phone, in that conversation only", async () => {
    const { send, receive } = setup();
    await receive(inbound({ text: "hello", externalId: "a1" }));
    send.mockClear();
    await ingestEvents(t.db, { statuses: [], messages: [inbound({ direction: "outbound", source: "phone_app", externalId: "echo1", text: "আমি দেখছি", contactName: undefined })] });
    expect((await conv()).botPaused).toBe(true);

    await receive(inbound({ text: "1", externalId: "a2" }));
    expect(send).not.toHaveBeenCalled();

    // A different customer is unaffected.
    await receive(inbound({ text: "1", contactExternalId: "8801822222222", externalId: "b1" }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("a redelivered webhook never triggers a second reply", async () => {
    const { send, deps } = setup();
    const m = inbound({ text: "1", externalId: "same" });
    const first = await ingestEvents(t.db, { messages: [m], statuses: [] });
    await processNewInbound(t.db, deps, first.newInbound);
    const second = await ingestEvents(t.db, { messages: [m], statuses: [] });
    expect(second.newInbound).toEqual([]);
    await processNewInbound(t.db, deps, second.newInbound);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("imported history never triggers the bot", async () => {
    const { send, receive } = setup();
    await receive(inbound({ source: "history", text: "1" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("after hours sends one notice, then not again within the cooldown", async () => {
    const { send, receive } = setup(CLOSED_NOW);
    await receive(inbound({ text: "hello", externalId: "n1" }, CLOSED_NOW));
    expect(send.mock.calls[0][0].text).toContain("অফিস বন্ধ");
    await receive(inbound({ text: "anyone?", externalId: "n2", timestamp: new Date(CLOSED_NOW.getTime() - 30_000) }, CLOSED_NOW));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("ignores disabled rules and rules with invalid config", async () => {
    await t.db.update(schema.automations).set({ enabled: false });
    await t.db.insert(schema.automations).values({ kind: "keyword", name: "broken", priority: 1, config: { keywords: [] } });
    const { send, receive } = setup();
    await receive(inbound({ text: "1" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("applies a channel-specific rule only to its channel", async () => {
    const [other] = await t.db.insert(schema.channels).values({ type: "messenger", name: "FB", externalId: "PAGE", status: "active", accessTokenEncrypted: encryptSecret("T2"), isTest: true, botEnabled: true }).returning({ id: schema.channels.id });
    await t.db.delete(schema.automations);
    await t.db.insert(schema.automations).values({ kind: "keyword", name: "only-fb", priority: 1, channelId: other.id, config: { keywords: ["hi"], reply: "FB only" } });
    const { send, receive } = setup();
    await receive(inbound({ text: "hi" })); // WhatsApp
    expect(send).not.toHaveBeenCalled();
    await receive(inbound({ text: "hi", channelType: "messenger", channelExternalId: "PAGE", contactExternalId: "PSID", externalId: "m1" }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ text: "FB only", channelExternalId: "PAGE" });
  });

  it("a failing send is logged and recorded, never thrown", async () => {
    const send = vi.fn().mockRejectedValue(new Error("Meta down"));
    const now = OPEN_NOW;
    const deps: RunDeps = { send: { adapterFor: () => ({ sendText: send }), now: () => now }, now: () => now, office: { tz: "Asia/Dhaka", open: "10:00", close: "22:00" } };
    const r = await ingestEvents(t.db, { messages: [inbound({ text: "1" })], statuses: [] });
    const log = vi.fn();
    await expect(processNewInbound(t.db, deps, r.newInbound, log)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("not sent"));
    expect((await t.db.select().from(schema.messages)).find((x) => x.status === "failed")).toMatchObject({ sentByBot: true, error: "Meta down" });
  });

  it("returns not_found for an unknown message and survives a thrown error in a batch", async () => {
    const { deps } = setup();
    expect(await runAutomationForMessage(t.db, deps, { conversationId: "00000000-0000-0000-0000-000000000000", messageExternalId: "x" })).toEqual({ decision: { action: "none", reason: "not_found" } });
    const log = vi.fn();
    await processNewInbound(t.db, deps, [{ conversationId: "not-a-uuid", messageExternalId: "x" }], log);
    expect(log).toHaveBeenCalledWith("automation failed", expect.anything());
  });
});
