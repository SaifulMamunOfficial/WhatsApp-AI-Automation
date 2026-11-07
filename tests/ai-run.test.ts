import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { ingestEvents } from "@/core/inbox/ingest";
import { processNewInbound, type RunDeps } from "@/core/automation/run";
import { sendReply } from "@/core/inbox/send";
import { setConversationStatus } from "@/core/inbox/mutations";
import { listConversations } from "@/core/inbox/queries";
import { AiProviderError, type AiProvider } from "@/core/ai/providers";
import { addArticle, deleteArticle, saveAiSettings, setArticleEnabled, updateArticle } from "@/core/ai/admin";
import { decideAutomation, type AutomationContext } from "@/core/automation/engine";
import type { NormalizedMessage } from "@/channels/types";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
const NOW = new Date("2026-03-10T08:00:00Z"); // 14:00 Dhaka, office hours
const HANDOFF = "একজন প্রতিনিধি শীঘ্রই উত্তর দেবেন।";

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "9".repeat(64);
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());

beforeEach(async () => {
  await t.db.delete(schema.automations);
  await t.db.delete(schema.knowledgeBase);
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.channels);
  await t.db.insert(schema.channels).values({ type: "whatsapp", name: "WA", externalId: "PNID", status: "active", accessTokenEncrypted: encryptSecret("TOK"), isTest: true, botEnabled: true });
  await t.db.insert(schema.knowledgeBase).values([
    { title: "কোর্স ফি", content: "ইলেকট্রিক্যাল ডিপ্লোমা কোর্সের ফি ৫০০০ টাকা।" },
    { title: "ঠিকানা", content: "অফিস মিরপুর, ঢাকা।" },
  ]);
  await saveAiSettings(t.db, { enabled: true, handoffText: HANDOFF, maxRepliesPerHour: 3 });
  await t.db.insert(schema.automations).values({ kind: "welcome", name: "w", priority: 10, config: { text: "স্বাগতম", idleHours: 72 } });
  await t.db.insert(schema.automations).values({ kind: "keyword", name: "k", priority: 20, config: { keywords: ["menu"], reply: "মেনু: ১ ফি" } });
});

const inbound = (text: string, id: string, ts = NOW.getTime() - 60_000): NormalizedMessage => ({
  channelType: "whatsapp", channelExternalId: "PNID", externalId: id, contactExternalId: "8801711111111", contactName: "Rahim",
  direction: "inbound", source: "api", type: "text", text, timestamp: new Date(ts),
});

function setup(reply: string | Error | null | "NO_PROVIDER") {
  const send = vi.fn().mockImplementation(async () => ({ externalId: `bot-${Math.random()}` }));
  const complete = vi.fn().mockImplementation(async () => {
    if (reply instanceof Error) throw reply;
    return reply as string;
  });
  const ai: AiProvider | null = reply === "NO_PROVIDER" ? null : { name: "anthropic", complete };
  const deps: RunDeps = { send: { adapterFor: () => ({ sendText: send }), now: () => NOW }, now: () => NOW, office: { tz: "Asia/Dhaka", open: "10:00", close: "22:00" }, ai };
  const receive = async (m: NormalizedMessage) => {
    const r = await ingestEvents(t.db, { messages: [m], statuses: [] });
    const log = vi.fn();
    await processNewInbound(t.db, deps, r.newInbound, log);
    return log;
  };
  return { send, complete, receive };
}
const conv = async () => (await t.db.select().from(schema.conversations))[0];
const ANSWER = '{"answer":"ফি ৫০০০ টাকা।","handoff":false,"reason":"kb"}';

describe("AI bot", () => {
  it("answers from the knowledge base and sends it as a bot reply", async () => {
    const { send, complete, receive } = setup(ANSWER);
    await receive(inbound("ফি কত?", "m1"));
    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete.mock.calls[0][0].system).toContain("ফি ৫০০০ টাকা");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].text).toBe("ফি ৫০০০ টাকা।");
    const c = await conv();
    expect(c).toMatchObject({ needsHuman: false, botPaused: false });
  });

  it("keyword rules win and the AI is not even called", async () => {
    const { send, complete, receive } = setup(ANSWER);
    await receive(inbound("menu", "m1"));
    expect(send.mock.calls[0][0].text).toBe("মেনু: ১ ফি");
    expect(complete).not.toHaveBeenCalled();
  });

  it("on handoff: flags 'needs a human', silences the bot, and tells the customer once", async () => {
    const { send, receive } = setup('{"answer":null,"handoff":true,"reason":"অভিযোগ"}');
    await receive(inbound("আমার টাকা ফেরত চাই", "m1"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].text).toBe(HANDOFF);
    expect(await conv()).toMatchObject({ needsHuman: true, botPaused: true, status: "open" });

    send.mockClear();
    await receive(inbound("কেউ আছেন?", "m2", NOW.getTime() - 30_000));
    expect(send).not.toHaveBeenCalled(); // bot stays silent until a person acts
  });

  it("a person's reply clears the flag; so does closing the conversation", async () => {
    const { receive } = setup('{"answer":null,"handoff":true}');
    await receive(inbound("complain", "m1"));
    expect((await conv()).needsHuman).toBe(true);
    const [u] = await t.db.insert(schema.users).values({ email: "a@x.com", name: "A", passwordHash: "x", role: "agent" }).returning({ id: schema.users.id });
    const r = await sendReply(t.db, { adapterFor: () => ({ sendText: async () => ({ externalId: "h1" }) }), now: () => NOW }, { conversationId: (await conv()).id, text: "দেখছি", sender: "human", userId: u.id });
    expect(r.ok).toBe(true);
    expect((await conv()).needsHuman).toBe(false);

    await t.db.update(schema.conversations).set({ needsHuman: true });
    await setConversationStatus(t.db, (await conv()).id, "closed");
    expect((await conv()).needsHuman).toBe(false);

    await t.db.update(schema.conversations).set({ needsHuman: true });
    await ingestEvents(t.db, { statuses: [], messages: [{ ...inbound("x", "echo1"), direction: "outbound", source: "phone_app", contactName: undefined }] });
    expect((await conv()).needsHuman).toBe(false); // answered from the phone
  });

  it("the inbox can list only conversations that need a person", async () => {
    const { receive } = setup('{"answer":null,"handoff":true}');
    await receive(inbound("complain", "m1"));
    await ingestEvents(t.db, { statuses: [], messages: [{ ...inbound("hi", "o1"), contactExternalId: "8801822222222", contactName: "Other" }] });
    const all = await listConversations(t.db, {}, "00000000-0000-0000-0000-000000000000");
    const needs = await listConversations(t.db, { needsHuman: true }, "00000000-0000-0000-0000-000000000000");
    expect(all).toHaveLength(2);
    expect(needs.map((c) => c.identityExternalId)).toEqual(["8801711111111"]);
  });

  it("a provider failure never blocks the customer silently: flagged for staff, plain rules still apply", async () => {
    const { send, receive } = setup(new AiProviderError("overloaded", 529));
    const log = await receive(inbound("ফি কত?", "m1")); // first message: the welcome is the fallback
    expect(log).toHaveBeenCalledWith(expect.stringContaining("AI failed: overloaded"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].text).toBe("স্বাগতম");
    expect(await conv()).toMatchObject({ needsHuman: true, botPaused: false });
  });

  it("an unparseable model reply becomes a handoff, not a garbled message", async () => {
    const { send, receive } = setup("দুঃখিত, আমি জানি না");
    await receive(inbound("ফি কত?", "m1"));
    expect(send.mock.calls[0][0].text).toBe(HANDOFF);
    expect((await conv()).needsHuman).toBe(true);
  });

  it("hands over after too many AI replies in an hour (loop/cost guard)", async () => {
    const { send, complete, receive } = setup(ANSWER);
    for (let i = 1; i <= 3; i++) await receive(inbound(`ফি কত? ${i}`, `m${i}`, NOW.getTime() - (10 - i) * 60_000));
    expect(complete).toHaveBeenCalledTimes(3);
    await receive(inbound("আরেকবার", "m4", NOW.getTime() - 10_000));
    expect(complete).toHaveBeenCalledTimes(3); // no 4th model call
    expect(send.mock.calls.at(-1)![0].text).toBe(HANDOFF);
    expect((await conv()).needsHuman).toBe(true);
  });

  it("does nothing special without a provider or without any enabled knowledge", async () => {
    const none = setup("NO_PROVIDER");
    await none.receive(inbound("ফি কত?", "m1"));
    expect(none.send.mock.calls[0][0].text).toBe("স্বাগতম"); // plain rules continue
    expect((await conv()).needsHuman).toBe(false);

    await t.db.delete(schema.contacts);
    await t.db.update(schema.knowledgeBase).set({ enabled: false });
    const empty = setup(ANSWER);
    await empty.receive(inbound("ফি কত?", "m2"));
    expect(empty.complete).not.toHaveBeenCalled();
  });

  it("respects the AI switch and never answers non-text messages with the AI", async () => {
    await t.db.update(schema.automations).set({ enabled: false }).where(eq(schema.automations.kind, "ai"));
    const off = setup(ANSWER);
    await off.receive(inbound("ফি কত?", "m1"));
    expect(off.complete).not.toHaveBeenCalled();

    await t.db.update(schema.automations).set({ enabled: true }).where(eq(schema.automations.kind, "ai"));
    await t.db.delete(schema.contacts);
    const on = setup(ANSWER);
    await on.receive({ ...inbound("১", "m2"), type: "image", text: "ছবি" });
    expect(on.complete).not.toHaveBeenCalled();
  });
});

describe("engine: AI priority", () => {
  const ctx = (over: Partial<AutomationContext> = {}): AutomationContext => ({
    channel: { id: "c", botEnabled: true }, conversation: { botPaused: false },
    message: { direction: "inbound", source: "api", type: "text", text: "ফি কত?" },
    inboundCount: 1, previousActivityAt: null, lastBotReplyAt: null, now: NOW,
    office: { tz: "Asia/Dhaka", open: "10:00", close: "22:00" }, aiAvailable: true, ...over,
  });
  const ai = { id: "ai", kind: "ai" as const, priority: 50, channelId: null, config: { handoffText: "H", maxRepliesPerHour: 6 } };
  const welcome = { id: "w", kind: "welcome" as const, priority: 10, channelId: null, config: { text: "W", idleHours: 72 } };
  const kw = { id: "k", kind: "keyword" as const, priority: 20, channelId: null, config: { keywords: ["ফি"], match: "contains" as const, reply: "K" } };

  it("AI beats the welcome, keywords beat the AI, and AI needs availability", () => {
    expect(decideAutomation([welcome, ai], ctx()).action).toBe("ai");
    expect(decideAutomation([welcome, ai, kw], ctx()).action).toBe("reply");
    expect(decideAutomation([welcome, ai], ctx({ aiAvailable: false }))).toMatchObject({ action: "reply", kind: "welcome" });
    expect(decideAutomation([ai], ctx({ conversation: { botPaused: true } }))).toEqual({ action: "none", reason: "bot_paused" });
  });
});

describe("knowledge admin", () => {
  it("adds, updates, toggles and deletes articles with validation", async () => {
    expect((await addArticle(t.db, { title: " ", content: "x" })).ok).toBe(false);
    expect((await addArticle(t.db, { title: "t", content: "x".repeat(4001) })).ok).toBe(false);
    expect((await addArticle(t.db, { title: "ভর্তি", content: "১–১০ তারিখ" })).ok).toBe(true);
    const row = (await t.db.select().from(schema.knowledgeBase)).find((a) => a.title === "ভর্তি")!;
    expect((await updateArticle(t.db, row.id, { title: "ভর্তি", content: "১–১৫ তারিখ" })).ok).toBe(true);
    expect((await updateArticle(t.db, row.id, { title: "", content: "x" })).ok).toBe(false);
    expect((await setArticleEnabled(t.db, row.id, false)).ok).toBe(true);
    expect((await t.db.select().from(schema.knowledgeBase).where(eq(schema.knowledgeBase.id, row.id)))[0]).toMatchObject({ content: "১–১৫ তারিখ", enabled: false });
    expect((await deleteArticle(t.db, row.id)).ok).toBe(true);
    const ghost = "00000000-0000-0000-0000-000000000000";
    expect((await deleteArticle(t.db, ghost)).ok).toBe(false);
    expect((await updateArticle(t.db, ghost, { title: "a", content: "b" })).ok).toBe(false);
    expect((await setArticleEnabled(t.db, ghost, true)).ok).toBe(false);
  });

  it("saves AI settings in a single global row, with sane defaults and limits", async () => {
    expect((await saveAiSettings(t.db, { enabled: false })).ok).toBe(true);
    const rows = (await t.db.select().from(schema.automations)).filter((a) => a.kind === "ai");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ enabled: false, config: { maxRepliesPerHour: 6 } });
    expect((rows[0].config as { handoffText: string }).handoffText).toContain("প্রতিনিধি");
    expect((await saveAiSettings(t.db, { enabled: true, maxRepliesPerHour: 0 })).ok).toBe(false);
    expect((await saveAiSettings(t.db, { enabled: true, maxRepliesPerHour: 61 })).ok).toBe(false);
  });
});
