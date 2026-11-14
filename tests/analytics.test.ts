import { describe, expect, it } from "vitest";
import { computeAnalytics, localSlot, type MsgRow } from "@/core/analytics/compute";

const OFFICE = { tz: "Asia/Dhaka", open: "10:00", close: "22:00" };
// 2026-03-10 is a Tuesday. 06:00Z = 12:00 Dhaka (open); 20:00Z = 02:00 next day Dhaka (closed).
const at = (iso: string) => new Date(iso);
const customer = (c: string, iso: string, over: Partial<MsgRow> = {}): MsgRow => ({ conversationId: c, direction: "inbound", source: "api", sentByBot: false, sentByUserId: null, sentAt: at(iso), ...over });
const agent = (c: string, iso: string, userId: string | null = "u1", over: Partial<MsgRow> = {}): MsgRow => ({ conversationId: c, direction: "outbound", source: userId ? "api" : "phone_app", sentByBot: false, sentByUserId: userId, sentAt: at(iso), ...over });
const bot = (c: string, iso: string): MsgRow => ({ conversationId: c, direction: "outbound", source: "api", sentByBot: true, sentByUserId: null, sentAt: at(iso) });

describe("localSlot", () => {
  it("gives the weekday (Mon=0) and hour in Dhaka", () => {
    expect(localSlot(at("2026-03-10T06:00:00Z"), "Asia/Dhaka")).toEqual({ weekday: 1, hour: 12 });
    expect(localSlot(at("2026-03-10T17:59:00Z"), "Asia/Dhaka")).toEqual({ weekday: 1, hour: 23 });
    expect(localSlot(at("2026-03-10T18:00:00Z"), "Asia/Dhaka")).toEqual({ weekday: 2, hour: 0 }); // midnight: next day
    expect(localSlot(at("2026-03-15T06:00:00Z"), "Asia/Dhaka")).toEqual({ weekday: 6, hour: 12 }); // Sunday
  });
});

describe("response times", () => {
  it("measures minutes from the customer's message to the first human reply", () => {
    const r = computeAnalytics([customer("a", "2026-03-10T06:00:00Z"), agent("a", "2026-03-10T06:10:00Z")], OFFICE);
    expect(r).toMatchObject({ answeredWaits: 1, avgMinutes: 10, medianMinutes: 10, within60Share: 1, unanswered: 0 });
  });

  it("several messages before the reply are ONE wait, measured from the first", () => {
    const r = computeAnalytics([customer("a", "2026-03-10T06:00:00Z"), customer("a", "2026-03-10T06:20:00Z"), agent("a", "2026-03-10T06:30:00Z")], OFFICE);
    expect(r.answeredWaits).toBe(1);
    expect(r.avgMinutes).toBe(30);
  });

  it("a bot reply does not end the wait or count as a human reply", () => {
    const r = computeAnalytics([customer("a", "2026-03-10T06:00:00Z"), bot("a", "2026-03-10T06:00:05Z"), agent("a", "2026-03-10T07:00:00Z")], OFFICE);
    expect(r).toMatchObject({ avgMinutes: 60, humanReplies: 1, botReplies: 1, answeredWaits: 1 });
  });

  it("averages, takes the median and the share answered within an hour", () => {
    const r = computeAnalytics(
      [
        customer("a", "2026-03-10T06:00:00Z"), agent("a", "2026-03-10T06:10:00Z"), // 10
        customer("b", "2026-03-10T06:00:00Z"), agent("b", "2026-03-10T06:20:00Z"), // 20
        customer("c", "2026-03-10T06:00:00Z"), agent("c", "2026-03-10T08:00:00Z"), // 120
      ],
      OFFICE,
    );
    expect(r.avgMinutes).toBeCloseTo(50);
    expect(r.medianMinutes).toBe(20);
    expect(r.within60Share).toBeCloseTo(2 / 3);
  });

  it("ignores waits that began outside office hours, and counts open ones as unanswered", () => {
    const r = computeAnalytics(
      [
        customer("night", "2026-03-10T20:00:00Z"), agent("night", "2026-03-11T05:00:00Z"), // 02:00 -> 11:00: not counted
        customer("open", "2026-03-10T06:00:00Z"), // no reply yet
        customer("nightOpen", "2026-03-10T20:00:00Z"), // no reply, but arrived at night: not "unanswered"
      ],
      OFFICE,
    );
    expect(r.answeredWaits).toBe(0);
    expect(r.avgMinutes).toBeNull();
    expect(r.unanswered).toBe(1);
  });

  it("leaves out history imports, broadcast sends and our own bot when counting customers and replies", () => {
    const r = computeAnalytics(
      [
        customer("a", "2026-03-10T06:00:00Z", { source: "history" }),
        { conversationId: "a", direction: "outbound", source: "api", sentByBot: false, sentByUserId: null, sentAt: at("2026-03-10T06:01:00Z") }, // broadcast template
      ],
      OFFICE,
    );
    expect(r).toMatchObject({ inbound: 0, humanReplies: 0, botReplies: 0 });
  });

  it("counts replies from the phone app or Page inbox as human, without a named agent", () => {
    const r = computeAnalytics([customer("a", "2026-03-10T06:00:00Z"), agent("a", "2026-03-10T06:05:00Z", null)], OFFICE);
    expect(r.humanReplies).toBe(1);
    expect(r.agents).toEqual([{ userId: null, replies: 1, conversations: 1, waits: 1, avgMinutes: 5 }]);
  });
});

describe("per agent", () => {
  it("counts replies, conversations and average wait for each agent, busiest first", () => {
    const r = computeAnalytics(
      [
        customer("a", "2026-03-10T06:00:00Z"), agent("a", "2026-03-10T06:10:00Z", "u1"), agent("a", "2026-03-10T06:15:00Z", "u1"),
        customer("b", "2026-03-10T06:00:00Z"), agent("b", "2026-03-10T06:40:00Z", "u2"),
      ],
      OFFICE,
    );
    expect(r.agents.map((x) => x.userId)).toEqual(["u1", "u2"]);
    expect(r.agents[0]).toEqual({ userId: "u1", replies: 2, conversations: 1, waits: 1, avgMinutes: 10 });
    expect(r.agents[1]).toEqual({ userId: "u2", replies: 1, conversations: 1, waits: 1, avgMinutes: 40 });
  });
});

describe("busiest times", () => {
  it("counts customer messages per hour and weekday in Dhaka time, and finds the peak", () => {
    const r = computeAnalytics(
      [
        customer("a", "2026-03-10T06:00:00Z"), customer("b", "2026-03-10T06:30:00Z"), customer("c", "2026-03-10T06:59:00Z"), // Tue 12:xx
        customer("d", "2026-03-10T18:00:00Z"), // Wed 00:00
      ],
      OFFICE,
    );
    expect(r.inbound).toBe(4);
    expect(r.byHour[12]).toBe(3);
    expect(r.byHour[0]).toBe(1);
    expect(r.byWeekday[1]).toBe(3);
    expect(r.byWeekday[2]).toBe(1);
    expect(r.heat[1][12]).toBe(3);
    expect(r.peak).toEqual({ weekday: 1, hour: 12, count: 3 });
  });

  it("has no peak and no averages when empty", () => {
    const r = computeAnalytics([], OFFICE);
    expect(r).toMatchObject({ inbound: 0, peak: null, avgMinutes: null, medianMinutes: null, within60Share: null, unanswered: 0, agents: [] });
    expect(r.heat).toHaveLength(7);
    expect(r.heat[0]).toHaveLength(24);
  });
});

describe("getAnalytics (database)", () => {
  it("reads messages in range and names the agents", async () => {
    const { createTestDb } = await import("./helpers/test-db");
    const schema = await import("@/db/schema");
    const { getAnalytics, parseRange } = await import("@/core/analytics/queries");
    const t = await createTestDb();
    try {
      const [ch] = await t.db.insert(schema.channels).values({ type: "whatsapp", name: "WA", externalId: "PX", isTest: true }).returning();
      const [c] = await t.db.insert(schema.contacts).values({ name: "A" }).returning();
      const [i] = await t.db.insert(schema.contactIdentities).values({ contactId: c.id, channelId: ch.id, externalId: "8801700000001" }).returning();
      const [conv] = await t.db.insert(schema.conversations).values({ channelId: ch.id, contactId: c.id, identityId: i.id }).returning();
      const [u] = await t.db.insert(schema.users).values({ email: "rina@x.org", name: "Rina", passwordHash: "x", role: "agent" }).returning();
      const NOW = new Date("2026-03-10T12:00:00Z");
      const base = { conversationId: conv.id, channelId: ch.id, type: "text" };
      await t.db.insert(schema.messages).values([
        { ...base, direction: "inbound", source: "api", sentAt: new Date("2026-03-10T06:00:00Z") },
        { ...base, direction: "outbound", source: "api", sentByUserId: u.id, sentAt: new Date("2026-03-10T06:12:00Z") },
        { ...base, direction: "inbound", source: "api", sentAt: new Date("2026-01-01T06:00:00Z") }, // outside the 30-day range
      ]);
      const r = await getAnalytics(t.db, 30, NOW);
      expect(r.analytics).toMatchObject({ inbound: 1, humanReplies: 1, avgMinutes: 12 });
      expect(r.names[u.id]).toBe("Rina");
      expect(r.truncated).toBe(false);
      expect(parseRange("7")).toBe(7);
      expect(parseRange("999")).toBe(30);
      expect(parseRange(undefined)).toBe(30);
    } finally {
      await t.close();
    }
  }, 60_000);
});
