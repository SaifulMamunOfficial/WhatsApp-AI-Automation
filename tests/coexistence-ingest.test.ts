import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ingestEvents } from "@/core/inbox/ingest";
import { parseWhatsAppWebhook } from "@/channels/whatsapp/parser";
import type { HistoryChunk, NormalizedMessage } from "@/channels/types";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let channelId: string;

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures/whatsapp", name), "utf8"));

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.channels);
  const [ch] = await t.db
    .insert(schema.channels)
    .values({ type: "whatsapp", name: "Coexistence", externalId: "106540352242922", status: "active", isTest: true })
    .returning({ id: schema.channels.id });
  channelId = ch.id;
  await t.db.insert(schema.whatsappSyncState).values({ channelId, historyStatus: "requested" });
});

const run = (payload: unknown) => ingestEvents(t.db, parseWhatsAppWebhook(payload));
const syncState = async () => (await t.db.select().from(schema.whatsappSyncState))[0];
const msgs = () => t.db.select().from(schema.messages);
const convs = () => t.db.select().from(schema.conversations);

describe("history import", () => {
  it("imports threads as source=history, without unread, bot pause, or open-inbox flooding", async () => {
    const r = await run(fixture("history-chunk.json"));
    expect(r.historyMessages).toBe(4);

    const all = await msgs();
    expect(all).toHaveLength(4);
    expect(all.every((m) => m.source === "history")).toBe(true);
    expect(all.find((m) => m.externalId === "wamid.HIST.BUSINESS.2")).toMatchObject({ direction: "outbound", status: "failed" });
    expect(all.find((m) => m.externalId === "wamid.HIST.CUSTOMER.1")).toMatchObject({ direction: "inbound", status: "read", body: "Hi, is the kit in stock?" });

    const cs = await convs();
    expect(cs).toHaveLength(2);
    for (const c of cs) {
      expect(c.unreadCount).toBe(0);
      expect(c.botPaused).toBe(false);
      expect(c.status).toBe("closed"); // fixture messages are from 2025: old chats stay out of the open inbox
    }
    const first = cs.find((c) => c.lastMessagePreview === "[media_placeholder]");
    expect(first).toBeDefined(); // newest message of thread 1 has no text
    expect(first!.lastCustomerMessageAt?.toISOString()).toBe("2025-06-08T16:30:00.000Z");
  });

  it("is idempotent: resending the same chunk adds nothing", async () => {
    await run(fixture("history-chunk.json"));
    const again = await run(fixture("history-chunk.json"));
    expect(again.historyMessages).toBe(0);
    expect(await msgs()).toHaveLength(4);
    expect((await syncState()).historyMessageCount).toBe(4); // not double counted
  });

  it("tracks progress: never backwards, complete at 100, and final after that", async () => {
    const chunk = fixture("history-chunk.json");
    const withProgress = (p: number) => {
      const c = structuredClone(chunk);
      c.entry[0].changes[0].value.history[0].metadata.progress = p;
      return c;
    };
    await run(withProgress(55));
    expect(await syncState()).toMatchObject({ historyStatus: "in_progress", historyProgress: 55 });
    await run(withProgress(20)); // an out-of-order, older chunk
    expect((await syncState()).historyProgress).toBe(55);
    await run(withProgress(100));
    expect(await syncState()).toMatchObject({ historyStatus: "complete", historyProgress: 100 });
    await run(withProgress(40));
    expect(await syncState()).toMatchObject({ historyStatus: "complete", historyProgress: 100 });
  });

  it("records a declined history sync and imports nothing", async () => {
    const r = await run(fixture("history-declined.json"));
    expect(r.historyMessages).toBe(0);
    expect(await msgs()).toHaveLength(0);
    expect(await syncState()).toMatchObject({ historyStatus: "declined" });
    expect((await syncState()).lastError).toContain("turned off");
  });

  it("opens a new conversation whose newest message is a recent customer message", async () => {
    const recent = Math.floor((Date.now() - 2 * 3600_000) / 1000);
    const chunk = fixture("history-chunk.json");
    const thread = chunk.entry[0].changes[0].value.history[0].threads[0];
    thread.messages = [{ from: "16505551234", id: "wamid.RECENT", timestamp: String(recent), type: "text", text: { body: "still there?" } }];
    chunk.entry[0].changes[0].value.history[0].threads.splice(1);
    await run(chunk);
    const [c] = await convs();
    expect(c).toMatchObject({ status: "open", unreadCount: 0 });
  });

  it("merges into an existing live conversation without rewinding it or reopening/pausing", async () => {
    // A live message arrived first (newer than anything in the history).
    const live: NormalizedMessage = {
      channelType: "whatsapp",
      channelExternalId: "106540352242922",
      externalId: "wamid.LIVE",
      contactExternalId: "16505551234",
      contactName: "Sheena",
      direction: "inbound",
      source: "api",
      type: "text",
      text: "live message",
      timestamp: new Date("2026-01-01T10:00:00Z"),
    };
    await ingestEvents(t.db, { messages: [live], statuses: [] });
    await t.db.update(schema.conversations).set({ status: "closed" });

    await run(fixture("history-chunk.json"));
    const cs = await convs();
    expect(cs).toHaveLength(2); // history thread 1 joined the live conversation
    const merged = cs.find((c) => c.lastMessagePreview === "live message")!;
    expect(merged.lastMessageAt.toISOString()).toBe("2026-01-01T10:00:00.000Z"); // not rewound
    expect(merged.status).toBe("closed"); // history does not reopen it
    expect(merged.unreadCount).toBe(1); // only the live message counted
    expect((await msgs()).filter((m) => m.conversationId === merged.id)).toHaveLength(4); // 1 live + 3 history
  });

  it("does not double-store a message whose echo already arrived live", async () => {
    await ingestEvents(t.db, {
      messages: [
        {
          channelType: "whatsapp",
          channelExternalId: "106540352242922",
          externalId: "wamid.HIST.BUSINESS.1",
          contactExternalId: "16505551234",
          direction: "outbound",
          source: "phone_app",
          type: "text",
          text: "Yes, we have it.",
          timestamp: new Date(1749400100 * 1000),
        },
      ],
      statuses: [],
    });
    const r = await run(fixture("history-chunk.json"));
    expect(r.historyMessages).toBe(3);
    const [kept] = await t.db.select().from(schema.messages).where(eq(schema.messages.externalId, "wamid.HIST.BUSINESS.1"));
    expect(kept.source).toBe("phone_app"); // the live record wins
  });

  it("ignores history for an unknown channel", async () => {
    const chunk = fixture("history-chunk.json");
    chunk.entry[0].changes[0].value.metadata.phone_number_id = "UNKNOWN";
    expect((await run(chunk)).historyMessages).toBe(0);
    expect(await msgs()).toHaveLength(0);
  });

  it("accepts a chunk object directly and survives a thread with only unusable messages", async () => {
    const chunk: HistoryChunk = {
      channelType: "whatsapp",
      channelExternalId: "106540352242922",
      phase: 1,
      chunkOrder: 2,
      progress: 30,
      threads: [{ contactExternalId: "1", messages: [] }],
    };
    const r = await ingestEvents(t.db, { messages: [], statuses: [], history: [chunk] });
    expect(r.historyMessages).toBe(0);
    expect(await syncState()).toMatchObject({ historyStatus: "in_progress", historyProgress: 30 });
  });
});

describe("contact sync (smb_app_state_sync)", () => {
  it("adds contacts with the phone's saved name, even without a conversation", async () => {
    const r = await run(fixture("state-sync-contacts.json"));
    expect(r.contactsSynced).toBe(1);
    const [contact] = await t.db.select().from(schema.contacts);
    expect(contact.name).toBe("Sheena Nelson");
    const [identity] = await t.db.select().from(schema.contactIdentities);
    expect(identity).toMatchObject({ channelId, externalId: "16505551234", displayName: "Sheena Nelson" });
    expect(await convs()).toHaveLength(0);
    expect((await syncState()).contactsSyncedCount).toBe(1);
  });

  it("the phone's saved name overrides the customer's profile name", async () => {
    await ingestEvents(t.db, {
      messages: [
        {
          channelType: "whatsapp",
          channelExternalId: "106540352242922",
          externalId: "m1",
          contactExternalId: "16505551234",
          contactName: "sheena_profile",
          direction: "inbound",
          source: "api",
          type: "text",
          text: "hi",
          timestamp: new Date(),
        },
      ],
      statuses: [],
    });
    await run(fixture("state-sync-contacts.json"));
    expect((await t.db.select().from(schema.contacts))[0].name).toBe("Sheena Nelson");
    expect(await t.db.select().from(schema.contacts)).toHaveLength(1); // same person, not duplicated
  });

  it("never deletes anything on 'remove'", async () => {
    await run(fixture("history-chunk.json"));
    const before = (await t.db.select().from(schema.contacts)).length;
    await run(fixture("state-sync-contacts.json")); // includes a remove for 16505559999
    expect((await t.db.select().from(schema.contacts)).length).toBe(before);
    expect(await convs()).toHaveLength(2);
  });

  it("is idempotent", async () => {
    await run(fixture("state-sync-contacts.json"));
    await run(fixture("state-sync-contacts.json"));
    expect(await t.db.select().from(schema.contactIdentities)).toHaveLength(1);
  });
});
