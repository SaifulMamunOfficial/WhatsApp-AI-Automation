import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { getDashboardStats, lastDays } from "@/core/dashboard/queries";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());

const NOW = new Date("2026-03-10T08:00:00Z"); // 14:00 in Dhaka

beforeEach(async () => {
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.channels);
});

async function seed() {
  const [ch] = await t.db.insert(schema.channels).values({ type: "whatsapp", name: "WA", externalId: "P1", isTest: true, status: "active" }).returning();
  const [c1] = await t.db.insert(schema.contacts).values({ name: "A", optedIn: true, createdAt: new Date("2026-03-09T00:00:00Z") }).returning();
  const [c2] = await t.db.insert(schema.contacts).values({ name: "B", createdAt: new Date("2026-02-01T00:00:00Z") }).returning();
  const idn = async (contactId: string, externalId: string) =>
    (await t.db.insert(schema.contactIdentities).values({ contactId, channelId: ch.id, externalId }).returning())[0];
  const [i1, i2] = [await idn(c1.id, "8801700000001"), await idn(c2.id, "8801700000002")];
  const [v1] = await t.db
    .insert(schema.conversations)
    .values({ channelId: ch.id, contactId: c1.id, identityId: i1.id, unreadCount: 2, needsHuman: true })
    .returning();
  await t.db.insert(schema.conversations).values({ channelId: ch.id, contactId: c2.id, identityId: i2.id, status: "closed" });
  return { ch, v1 };
}

describe("lastDays", () => {
  it("gives 7 Dhaka days, oldest first, ending today", () => {
    const d = lastDays(NOW, 7);
    expect(d).toHaveLength(7);
    expect(d[6]).toBe("2026-03-10");
    expect(d[0]).toBe("2026-03-04");
  });
  it("rolls to the next day after 18:00 UTC (midnight Dhaka)", () => {
    expect(lastDays(new Date("2026-03-10T19:00:00Z"), 1)).toEqual(["2026-03-11"]);
  });
});

describe("getDashboardStats", () => {
  it("is all zeros on an empty database, with 7 days", async () => {
    const s = await getDashboardStats(t.db, NOW);
    expect(s).toMatchObject({ open: 0, unread: 0, needsHuman: 0, contactsTotal: 0, botShare: null, lastBroadcast: null });
    expect(s.days).toHaveLength(7);
    expect(s.days.every((d) => d.inbound === 0 && d.bot === 0 && d.human === 0)).toBe(true);
  });

  it("counts open work, per-day messages (Dhaka days), bot share, history excluded", async () => {
    const { ch, v1 } = await seed();
    const base = { conversationId: v1.id, channelId: ch.id, type: "text" };
    await t.db.insert(schema.messages).values([
      { ...base, direction: "inbound", source: "api", sentAt: new Date("2026-03-10T05:00:00Z") },
      { ...base, direction: "inbound", source: "api", sentAt: new Date("2026-03-10T06:00:00Z") },
      { ...base, direction: "outbound", source: "api", sentByBot: true, sentAt: new Date("2026-03-10T06:01:00Z") },
      { ...base, direction: "outbound", source: "phone_app", sentAt: new Date("2026-03-09T06:00:00Z") },
      // 19:00Z on the 9th is already the 10th in Dhaka
      { ...base, direction: "inbound", source: "api", sentAt: new Date("2026-03-09T19:00:00Z") },
      { ...base, direction: "inbound", source: "history", sentAt: new Date("2026-03-10T01:00:00Z") },
      { ...base, direction: "inbound", source: "api", sentAt: new Date("2026-01-01T00:00:00Z") },
    ]);
    const s = await getDashboardStats(t.db, NOW);
    expect(s).toMatchObject({ open: 1, unread: 1, needsHuman: 1, unassigned: 1, contactsTotal: 2, contactsNew7: 1, optedIn: 1 });
    const today = s.days[6];
    expect(today).toMatchObject({ date: "2026-03-10", inbound: 3, bot: 1, human: 0 });
    expect(s.days[5]).toMatchObject({ date: "2026-03-09", inbound: 0, human: 1 });
    expect(s.todayInbound).toBe(3);
    expect(s.todayReplies).toBe(1);
    expect(s.botShare).toBeCloseTo(0.5);
    expect(s.channels).toEqual([expect.objectContaining({ name: "WA", open: 1, botEnabled: false })]);
  });
});
