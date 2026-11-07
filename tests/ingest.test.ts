import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ingestEvents } from "@/core/inbox/ingest";
import type { NormalizedMessage, StatusUpdate } from "@/channels/types";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let channelId: string;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.delete(schema.contacts); // cascades to identities, conversations, messages
  await t.db.delete(schema.channels);
  const [ch] = await t.db
    .insert(schema.channels)
    .values({ type: "whatsapp", name: "Test", externalId: "PNID", isTest: true })
    .returning({ id: schema.channels.id });
  channelId = ch.id;
});

const msg = (over: Partial<NormalizedMessage> = {}): NormalizedMessage => ({
  channelType: "whatsapp",
  channelExternalId: "PNID",
  externalId: "wamid.1",
  contactExternalId: "8801711111111",
  contactName: "Rahim",
  direction: "inbound",
  source: "api",
  type: "text",
  text: "দাম কত?",
  timestamp: new Date("2026-01-01T10:00:00Z"),
  ...over,
});

const ingest = (messages: NormalizedMessage[], statuses: StatusUpdate[] = []) =>
  ingestEvents(t.db, { messages, statuses });

describe("ingestEvents", () => {
  it("creates contact, identity, conversation and message from a first inbound message", async () => {
    const r = await ingest([msg()]);
    expect(r).toMatchObject({ stored: 1, duplicates: 0, unknownChannel: 0 });

    const [contact] = await t.db.select().from(schema.contacts);
    expect(contact.name).toBe("Rahim");
    const [identity] = await t.db.select().from(schema.contactIdentities);
    expect(identity).toMatchObject({ channelId, externalId: "8801711111111", displayName: "Rahim" });
    const [conv] = await t.db.select().from(schema.conversations);
    expect(conv).toMatchObject({ channelId, unreadCount: 1, botPaused: false, status: "open", lastMessagePreview: "দাম কত?" });
    expect(conv.lastCustomerMessageAt?.toISOString()).toBe("2026-01-01T10:00:00.000Z");
    const [m] = await t.db.select().from(schema.messages);
    expect(m).toMatchObject({ externalId: "wamid.1", direction: "inbound", source: "api", body: "দাম কত?" });
  });

  it("is idempotent: the same wamid twice stores one message and counts unread once", async () => {
    await ingest([msg()]);
    const again = await ingest([msg()]);
    expect(again).toMatchObject({ stored: 0, duplicates: 1 });
    expect(await t.db.select().from(schema.messages)).toHaveLength(1);
    const [conv] = await t.db.select().from(schema.conversations);
    expect(conv.unreadCount).toBe(1);
  });

  it("dedupes within a single batch", async () => {
    const r = await ingest([msg(), msg()]);
    expect(r).toMatchObject({ stored: 1, duplicates: 1 });
  });

  it("reuses the same conversation for later messages from the same person", async () => {
    await ingest([msg()]);
    await ingest([msg({ externalId: "wamid.2", text: "আছে?", timestamp: new Date("2026-01-01T10:05:00Z") })]);
    expect(await t.db.select().from(schema.contacts)).toHaveLength(1);
    const convs = await t.db.select().from(schema.conversations);
    expect(convs).toHaveLength(1);
    expect(convs[0]).toMatchObject({ unreadCount: 2, lastMessagePreview: "আছে?" });
  });

  it("a phone-app echo is stored as outbound and pauses the bot", async () => {
    await ingest([msg()]);
    await ingest([
      msg({
        externalId: "wamid.echo",
        direction: "outbound",
        source: "phone_app",
        contactName: undefined,
        text: "জি, আছে।",
        timestamp: new Date("2026-01-01T10:10:00Z"),
      }),
    ]);
    const [conv] = await t.db.select().from(schema.conversations);
    expect(conv.botPaused).toBe(true);
    expect(conv.unreadCount).toBe(1); // an echo is not an unread customer message
    const [echo] = await t.db.select().from(schema.messages).where(eq(schema.messages.externalId, "wamid.echo"));
    expect(echo).toMatchObject({ direction: "outbound", source: "phone_app" });
  });

  it("an out-of-order older message does not rewind the conversation", async () => {
    await ingest([msg({ externalId: "new", text: "নতুন", timestamp: new Date("2026-01-01T12:00:00Z") })]);
    await ingest([msg({ externalId: "old", text: "পুরনো", timestamp: new Date("2026-01-01T09:00:00Z") })]);
    const [conv] = await t.db.select().from(schema.conversations);
    expect(conv.lastMessagePreview).toBe("নতুন");
    expect(conv.lastMessageAt.toISOString()).toBe("2026-01-01T12:00:00.000Z");
  });

  it("uses [type] as the preview for media without a caption, and reopens a closed conversation", async () => {
    await ingest([msg()]);
    await t.db.update(schema.conversations).set({ status: "closed" });
    await ingest([msg({ externalId: "img", type: "image", text: undefined, timestamp: new Date("2026-01-01T11:00:00Z") })]);
    const [conv] = await t.db.select().from(schema.conversations);
    expect(conv).toMatchObject({ lastMessagePreview: "[image]", status: "open" });
  });

  it("drops messages for unknown channels without creating anything", async () => {
    const r = await ingest([msg({ channelExternalId: "NOPE" })]);
    expect(r).toMatchObject({ stored: 0, unknownChannel: 1 });
    expect(await t.db.select().from(schema.contacts)).toHaveLength(0);
  });

  it("keeps the same phone number on two channels as separate identities", async () => {
    const [ch2] = await t.db
      .insert(schema.channels)
      .values({ type: "whatsapp", name: "Second", externalId: "PNID2" })
      .returning({ id: schema.channels.id });
    await ingest([msg(), msg({ externalId: "w2", channelExternalId: "PNID2" })]);
    expect(await t.db.select().from(schema.contactIdentities)).toHaveLength(2);
    expect(ch2.id).not.toBe(channelId);
  });

  it("status updates only move forward and failed records the error", async () => {
    await ingest([msg({ externalId: "out1", direction: "outbound", source: "api", contactName: undefined })]);
    const st = (status: StatusUpdate["status"], error?: string): StatusUpdate => ({
      channelType: "whatsapp",
      channelExternalId: "PNID",
      externalId: "out1",
      status,
      timestamp: new Date(),
      error,
    });
    const get = async () => (await t.db.select().from(schema.messages).where(eq(schema.messages.externalId, "out1")))[0];

    await ingest([], [st("read")]);
    expect((await get()).status).toBe("read");
    await ingest([], [st("delivered")]); // late, older status
    expect((await get()).status).toBe("read");
    await ingest([], [st("failed", "boom")]); // too late to fail
    expect((await get()).status).toBe("read");

    await ingest([msg({ externalId: "out2", direction: "outbound", source: "api", contactName: undefined })]);
    await ingest([], [{ ...st("failed", "131047 Re-engagement"), externalId: "out2" }]);
    const [out2] = await t.db.select().from(schema.messages).where(eq(schema.messages.externalId, "out2"));
    expect(out2).toMatchObject({ status: "failed", error: "131047 Re-engagement" });
  });

  it("ignores a status for a message we do not have", async () => {
    const r = await ingest([], [{ channelType: "whatsapp", channelExternalId: "PNID", externalId: "ghost", status: "read", timestamp: new Date() }]);
    expect(r.statusesApplied).toBe(0);
  });
});

describe("ingestEvents — Messenger", () => {
  let pageChannelId: string;
  beforeEach(async () => {
    const [ch] = await t.db
      .insert(schema.channels)
      .values({ type: "messenger", name: "Test Page", externalId: "PAGE1", isTest: true })
      .returning({ id: schema.channels.id });
    pageChannelId = ch.id;
  });

  const mm = (over: Partial<NormalizedMessage> = {}): NormalizedMessage => ({
    channelType: "messenger",
    channelExternalId: "PAGE1",
    externalId: "mid.1",
    contactExternalId: "PSID1",
    direction: "inbound",
    source: "api",
    type: "text",
    text: "হ্যালো",
    timestamp: new Date("2026-01-02T10:00:00Z"),
    ...over,
  });

  it("stores a Messenger message on the Page channel; the same id as a WhatsApp number is a separate identity", async () => {
    await ingest([msg({ contactExternalId: "PSID1" }), mm()]);
    const ids = await t.db.select().from(schema.contactIdentities);
    expect(ids).toHaveLength(2);
    expect(ids.some((i) => i.channelId === pageChannelId)).toBe(true);
  });

  it("a Page-inbox echo pauses the bot; an echo of our own API send does not", async () => {
    await ingest([mm()]);
    await ingest([mm({ externalId: "mid.ours", direction: "outbound", source: "api", text: "bot", timestamp: new Date("2026-01-02T10:01:00Z") })]);
    let [conv] = await t.db.select().from(schema.conversations).where(eq(schema.conversations.channelId, pageChannelId));
    expect(conv.botPaused).toBe(false);

    await ingest([mm({ externalId: "mid.human", direction: "outbound", source: "page_inbox", text: "মানুষ", timestamp: new Date("2026-01-02T10:02:00Z") })]);
    [conv] = await t.db.select().from(schema.conversations).where(eq(schema.conversations.channelId, pageChannelId));
    expect(conv.botPaused).toBe(true);
    expect(conv.unreadCount).toBe(1);
  });
});
