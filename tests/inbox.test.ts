import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { ingestEvents } from "@/core/inbox/ingest";
import { sendReply, type SendDeps } from "@/core/inbox/send";
import { getConversation, listConversations } from "@/core/inbox/queries";
import { addNote, assignConversation, markRead, resumeBot, setConversationStatus } from "@/core/inbox/mutations";
import { subscribeInbox, type InboxEvent } from "@/core/inbox/events";
import type { NormalizedMessage } from "@/channels/types";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let wa: string; // WhatsApp channel id
let admin: { id: string; role: "admin" };
let agent: { id: string; role: "agent" };
let agent2: { id: string; role: "agent" };

const NOW = new Date("2026-03-10T12:00:00Z");

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "c".repeat(64);
  t = await createTestDb();
}, 60_000);
afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.channels);
  await t.db.delete(schema.users);
  const mkUser = async (email: string, role: "admin" | "agent") =>
    (await t.db.insert(schema.users).values({ email, name: email.split("@")[0], passwordHash: "x", role }).returning({ id: schema.users.id }))[0].id;
  admin = { id: await mkUser("admin@x.com", "admin"), role: "admin" };
  agent = { id: await mkUser("agent@x.com", "agent"), role: "agent" };
  agent2 = { id: await mkUser("agent2@x.com", "agent"), role: "agent" };

  const token = encryptSecret("SECRET-TOKEN");
  [{ id: wa }] = await t.db
    .insert(schema.channels)
    .values([
      { type: "whatsapp", name: "WA", externalId: "PNID", status: "active", accessTokenEncrypted: token, isTest: true },
      { type: "messenger", name: "FB", externalId: "PAGE1", status: "active", accessTokenEncrypted: token, isTest: true },
    ])
    .returning({ id: schema.channels.id });
});

const inbound = (over: Partial<NormalizedMessage> = {}): NormalizedMessage => ({
  channelType: "whatsapp",
  channelExternalId: "PNID",
  externalId: `in-${Math.random()}`,
  contactExternalId: "8801711111111",
  contactName: "Rahim",
  direction: "inbound",
  source: "api",
  type: "text",
  text: "দাম কত?",
  timestamp: new Date(NOW.getTime() - 60_000),
  ...over,
});

const ingest = (...messages: NormalizedMessage[]) => ingestEvents(t.db, { messages, statuses: [] });
const firstConv = async () => (await t.db.select().from(schema.conversations))[0];

function deps(send = vi.fn().mockResolvedValue({ externalId: "out-1" })) {
  const d: SendDeps = { adapterFor: () => ({ sendText: send }), now: () => NOW };
  return { d, send };
}

describe("sendReply", () => {
  it("sends on the right channel with the decrypted token, records it, and pauses the bot", async () => {
    await ingest(inbound());
    const conv = await firstConv();
    const { d, send } = deps();

    const r = await sendReply(t.db, d, { conversationId: conv.id, text: "  ৫০০ টাকা  ", sender: "human", userId: agent.id });
    expect(r.ok).toBe(true);
    expect(send).toHaveBeenCalledWith({
      channelExternalId: "PNID",
      accessToken: "SECRET-TOKEN",
      to: "8801711111111",
      text: "৫০০ টাকা",
      humanAgent: false,
    });

    const [out] = await t.db.select().from(schema.messages).where(eq(schema.messages.externalId, "out-1"));
    expect(out).toMatchObject({ direction: "outbound", source: "api", status: "sent", body: "৫০০ টাকা", sentByUserId: agent.id, sentByBot: false });
    const after = await firstConv();
    expect(after).toMatchObject({ botPaused: true, lastMessagePreview: "৫০০ টাকা" });
  });

  it("a bot reply does not pause the bot and is flagged sentByBot", async () => {
    await ingest(inbound());
    const conv = await firstConv();
    const r = await sendReply(t.db, deps().d, { conversationId: conv.id, text: "স্বাগতম", sender: "bot" });
    expect(r.ok).toBe(true);
    expect((await firstConv()).botPaused).toBe(false);
    const [m] = await t.db.select().from(schema.messages).where(eq(schema.messages.externalId, "out-1"));
    expect(m.sentByBot).toBe(true);
  });

  it("refuses outside the WhatsApp window and never calls the provider", async () => {
    await ingest(inbound({ timestamp: new Date(NOW.getTime() - 30 * 3600_000) }));
    const { d, send } = deps();
    const r = await sendReply(t.db, d, { conversationId: (await firstConv()).id, text: "hi", sender: "human", userId: agent.id });
    expect(r).toMatchObject({ ok: false, code: "window_closed" });
    expect(send).not.toHaveBeenCalled();
    expect(await t.db.select().from(schema.messages)).toHaveLength(1); // only the inbound one
  });

  it("Messenger: a human uses HUMAN_AGENT after 24h, the bot is refused", async () => {
    await ingest(inbound({ channelType: "messenger", channelExternalId: "PAGE1", contactExternalId: "PSID", timestamp: new Date(NOW.getTime() - 48 * 3600_000) }));
    const conv = await firstConv();
    const human = deps();
    expect((await sendReply(t.db, human.d, { conversationId: conv.id, text: "sorry for the delay", sender: "human", userId: agent.id })).ok).toBe(true);
    expect(human.send.mock.calls[0][0]).toMatchObject({ humanAgent: true, to: "PSID" });

    const bot = deps();
    expect(await sendReply(t.db, bot.d, { conversationId: conv.id, text: "auto", sender: "bot" })).toMatchObject({ ok: false, code: "window_closed" });
    expect(bot.send).not.toHaveBeenCalled();
  });

  it("records a failed send with the provider error", async () => {
    await ingest(inbound());
    const { d } = deps(vi.fn().mockRejectedValue(new Error("Meta said no")));
    const r = await sendReply(t.db, d, { conversationId: (await firstConv()).id, text: "hi", sender: "human", userId: agent.id });
    expect(r).toMatchObject({ ok: false, code: "send_failed", error: "Meta said no" });
    const failed = (await t.db.select().from(schema.messages)).find((m) => m.status === "failed");
    expect(failed).toMatchObject({ error: "Meta said no", body: "hi" });
  });

  it("merges with an echo that arrived before the send returned", async () => {
    await ingest(inbound({ channelType: "messenger", channelExternalId: "PAGE1", contactExternalId: "PSID" }));
    const conv = await firstConv();
    // The echo of our own API message lands before sendReply gets its response.
    const send = vi.fn().mockImplementation(async () => {
      await ingest(inbound({ channelType: "messenger", channelExternalId: "PAGE1", contactExternalId: "PSID", externalId: "mid.race", direction: "outbound", source: "api", text: "hello" }));
      return { externalId: "mid.race" };
    });
    const r = await sendReply(t.db, deps(send).d, { conversationId: conv.id, text: "hello", sender: "human", userId: agent.id });
    expect(r.ok).toBe(true);
    const rows = await t.db.select().from(schema.messages).where(eq(schema.messages.direction, "outbound"));
    expect(rows).toHaveLength(1); // not duplicated
    expect(rows[0]).toMatchObject({ externalId: "mid.race", sentByUserId: agent.id, status: "sent" });
  });

  it("rejects empty text, unknown conversations and channels without a token", async () => {
    await ingest(inbound());
    const conv = await firstConv();
    expect(await sendReply(t.db, deps().d, { conversationId: conv.id, text: "   ", sender: "human", userId: agent.id })).toMatchObject({ code: "empty" });
    expect(await sendReply(t.db, deps().d, { conversationId: "00000000-0000-0000-0000-000000000000", text: "x", sender: "human", userId: agent.id })).toMatchObject({ code: "not_found" });
    await t.db.update(schema.channels).set({ accessTokenEncrypted: null }).where(eq(schema.channels.id, wa));
    expect(await sendReply(t.db, deps().d, { conversationId: conv.id, text: "x", sender: "human", userId: agent.id })).toMatchObject({ code: "channel_not_ready" });
  });
});

describe("queries", () => {
  beforeEach(async () => {
    await ingest(
      inbound({ externalId: "a", contactExternalId: "8801711111111", contactName: "Rahim Uddin", text: "দাম কত?", timestamp: new Date(NOW.getTime() - 3000) }),
      inbound({ externalId: "b", contactExternalId: "8801822222222", contactName: "Karim", text: "ডেলিভারি", timestamp: new Date(NOW.getTime() - 2000) }),
      inbound({ externalId: "c", channelType: "messenger", channelExternalId: "PAGE1", contactExternalId: "PSID9", contactName: undefined, text: "hello", timestamp: new Date(NOW.getTime() - 1000) }),
    );
  });

  it("lists newest first and filters by channel", async () => {
    const all = await listConversations(t.db, {}, agent.id);
    expect(all.map((c) => c.identityExternalId)).toEqual(["PSID9", "8801822222222", "8801711111111"]);
    expect((await listConversations(t.db, { channelType: "whatsapp" }, agent.id)).map((c) => c.channelType)).toEqual(["whatsapp", "whatsapp"]);
    expect(await listConversations(t.db, { channelType: "messenger" }, agent.id)).toHaveLength(1);
  });

  it("filters by assignment and status", async () => {
    const [target] = await listConversations(t.db, { q: "Karim" }, agent.id);
    await assignConversation(t.db, agent, target.id, agent.id);
    expect((await listConversations(t.db, { assigned: "me" }, agent.id)).map((c) => c.id)).toEqual([target.id]);
    expect(await listConversations(t.db, { assigned: "me" }, agent2.id)).toHaveLength(0);
    expect(await listConversations(t.db, { assigned: "unassigned" }, agent.id)).toHaveLength(2);

    await setConversationStatus(t.db, target.id, "closed");
    expect(await listConversations(t.db, {}, agent.id)).toHaveLength(2); // open by default
    expect(await listConversations(t.db, { status: "closed" }, agent.id)).toHaveLength(1);
    expect(await listConversations(t.db, { status: "all" }, agent.id)).toHaveLength(3);
  });

  it("searches name, number and preview, and treats LIKE wildcards literally", async () => {
    expect((await listConversations(t.db, { q: "rahim" }, agent.id)).map((c) => c.contactName)).toEqual(["Rahim Uddin"]);
    expect(await listConversations(t.db, { q: "0182222" }, agent.id)).toHaveLength(1);
    expect(await listConversations(t.db, { q: "ডেলিভারি" }, agent.id)).toHaveLength(1);
    expect(await listConversations(t.db, { q: "%" }, agent.id)).toHaveLength(0);
    expect(await listConversations(t.db, { q: "_" }, agent.id)).toHaveLength(0);
  });

  it("returns a conversation with its messages oldest-first and notes", async () => {
    const [c] = await listConversations(t.db, { q: "Rahim" }, agent.id);
    await ingest(inbound({ externalId: "a2", text: "আছে?", timestamp: new Date(NOW.getTime() - 500) }));
    await addNote(t.db, agent, c.id, "VIP গ্রাহক");
    const detail = await getConversation(t.db, c.id);
    expect(detail!.messages.map((m) => m.body)).toEqual(["দাম কত?", "আছে?"]);
    expect(detail!.notes).toMatchObject([{ body: "VIP গ্রাহক", userName: "agent" }]);
    expect(await getConversation(t.db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("mutations", () => {
  let convId: string;
  beforeEach(async () => {
    await ingest(inbound());
    convId = (await firstConv()).id;
  });

  it("admins assign to anyone; agents only take for themselves or release their own", async () => {
    expect((await assignConversation(t.db, admin, convId, agent.id)).ok).toBe(true);
    expect((await firstConv()).assignedUserId).toBe(agent.id);

    expect((await assignConversation(t.db, agent2, convId, agent.id)).ok).toBe(false); // not for someone else
    expect((await assignConversation(t.db, agent2, convId, null)).ok).toBe(false); // not someone else's
    expect((await assignConversation(t.db, agent, convId, null)).ok).toBe(true); // own release
    expect((await assignConversation(t.db, agent2, convId, agent2.id)).ok).toBe(true); // take for self
    expect((await firstConv()).assignedUserId).toBe(agent2.id);
  });

  it("rejects assigning to an inactive or unknown user and an unknown conversation", async () => {
    await t.db.update(schema.users).set({ active: false }).where(eq(schema.users.id, agent.id));
    expect((await assignConversation(t.db, admin, convId, agent.id)).ok).toBe(false);
    expect((await assignConversation(t.db, admin, "00000000-0000-0000-0000-000000000000", null)).ok).toBe(false);
  });

  it("validates notes", async () => {
    expect((await addNote(t.db, agent, convId, "   ")).ok).toBe(false);
    expect((await addNote(t.db, agent, convId, "x".repeat(5001))).ok).toBe(false);
    expect((await addNote(t.db, agent, convId, "ok")).ok).toBe(true);
  });

  it("markRead clears unread and only publishes when something changed", async () => {
    const events: InboxEvent[] = [];
    const off = subscribeInbox((e) => events.push(e));
    await markRead(t.db, convId);
    await markRead(t.db, convId); // already 0: must not publish again (prevents refresh loops)
    off();
    expect((await firstConv()).unreadCount).toBe(0);
    expect(events).toHaveLength(1);
  });

  it("resumeBot clears the pause", async () => {
    await t.db.update(schema.conversations).set({ botPaused: true });
    expect((await resumeBot(t.db, convId)).ok).toBe(true);
    expect((await firstConv()).botPaused).toBe(false);
  });

  it("ingest publishes an event for a stored message but not for a duplicate", async () => {
    const events: InboxEvent[] = [];
    const off = subscribeInbox((e) => events.push(e));
    const m = inbound({ externalId: "evt-1" });
    await ingest(m);
    await ingest(m);
    off();
    expect(events).toEqual([{ type: "conversation", conversationId: convId }]);
  });
});
