import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { activeHoliday, daysBetween, isRealDate, localDate, type Holiday } from "@/core/automation/holiday-rules";
import { addHoliday, deleteHoliday, listHolidays, MAX_HOLIDAY_DAYS, setHolidayEnabled, updateHoliday } from "@/core/automation/holidays";
import { setBotEnabled, setBotMode } from "@/core/automation/admin";
import { botModeColumns, botModeOf, isBotMode } from "@/core/automation/bot-mode";
import { decideAutomation, OFFICE_REPLY_COOLDOWN_MS, type AutomationContext } from "@/core/automation/engine";
import type { Automation } from "@/core/automation/config";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());
beforeEach(async () => {
  await t.db.delete(schema.holidays);
});

const EID: Holiday = { id: "h1", name: "ঈদ", startDate: "2026-03-20", endDate: "2026-03-22", text: "ঈদের ছুটি চলছে। ২৩ মার্চ থেকে অফিস খোলা।" };

describe("calendar days in the office time zone", () => {
  it("uses Dhaka's date, not the server's", () => {
    expect(localDate(new Date("2026-03-20T17:59:00Z"), "Asia/Dhaka")).toBe("2026-03-20"); // 23:59 in Dhaka
    expect(localDate(new Date("2026-03-20T18:00:00Z"), "Asia/Dhaka")).toBe("2026-03-21"); // midnight in Dhaka
    expect(localDate(new Date("2026-03-20T18:00:00Z"), "UTC")).toBe("2026-03-20");
  });

  it("a holiday covers its first and last day entirely, and nothing around them", () => {
    const at = (iso: string) => activeHoliday(new Date(iso), "Asia/Dhaka", [EID]);
    expect(at("2026-03-19T17:59:00Z")).toBeUndefined(); // 19 Mar 23:59 Dhaka
    expect(at("2026-03-19T18:00:00Z")?.id).toBe("h1"); // 20 Mar 00:00
    expect(at("2026-03-22T17:59:00Z")?.id).toBe("h1"); // 22 Mar 23:59
    expect(at("2026-03-22T18:00:00Z")).toBeUndefined(); // 23 Mar 00:00
  });

  it("validates real dates and counts days", () => {
    expect(isRealDate("2026-02-28")).toBe(true);
    expect(isRealDate("2026-02-30")).toBe(false);
    expect(isRealDate("26-1-1")).toBe(false);
    expect(daysBetween("2026-03-20", "2026-03-22")).toBe(2);
  });
});

describe("decideAutomation with holidays", () => {
  const welcome: Automation = { id: "w", kind: "welcome", priority: 10, channelId: null, config: { text: "স্বাগতম", idleHours: 72 } };
  const office: Automation = { id: "o", kind: "office_hours", priority: 40, channelId: null, config: { text: "এখন অফিস বন্ধ" } };
  const price: Automation = { id: "k1", kind: "keyword", priority: 20, channelId: null, config: { keywords: ["মূল্য"], match: "contains", reply: "ফি ৫০০০ টাকা" } };
  const DURING = new Date("2026-03-21T08:00:00Z"); // 14:00 Dhaka, inside office hours, on a holiday

  const ctx = (over: Partial<AutomationContext> = {}, text = "hello"): AutomationContext => ({
    channel: { id: "c1", botEnabled: true },
    conversation: { botPaused: false },
    message: { direction: "inbound", source: "api", type: "text", text },
    inboundCount: 1,
    previousActivityAt: null,
    lastBotReplyAt: null,
    now: DURING,
    office: { tz: "Asia/Dhaka", open: "10:00", close: "22:00" },
    holidays: [EID],
    ...over,
  });

  it("sends the holiday text, even inside normal office hours, instead of the welcome", () => {
    expect(decideAutomation([welcome, office], ctx())).toMatchObject({ action: "reply", kind: "holiday", automationId: "h1", text: EID.text });
  });

  it("holiday text wins over the after-hours notice", () => {
    expect(decideAutomation([welcome, office], ctx({ now: new Date("2026-03-21T20:00:00Z") }))).toMatchObject({ kind: "holiday" });
  });

  it("a keyword answer still beats the holiday notice", () => {
    expect(decideAutomation([price, welcome], ctx({}, "মূল্য কত"))).toMatchObject({ kind: "keyword", text: "ফি ৫০০০ টাকা" });
  });

  it("sends the notice at most once per 12 hours per conversation", () => {
    const recent = new Date(DURING.getTime() - OFFICE_REPLY_COOLDOWN_MS + 60_000);
    expect(decideAutomation([welcome], ctx({ lastBotReplyAt: recent }))).toEqual({ action: "none", reason: "already_replied" });
    const old = new Date(DURING.getTime() - OFFICE_REPLY_COOLDOWN_MS - 60_000);
    expect(decideAutomation([welcome], ctx({ lastBotReplyAt: old }))).toMatchObject({ kind: "holiday" });
  });

  it("does nothing special outside the holiday, with none configured, or when the bot is off / paused", () => {
    expect(decideAutomation([welcome], ctx({ now: new Date("2026-03-23T08:00:00Z") }))).toMatchObject({ kind: "welcome" });
    expect(decideAutomation([welcome], ctx({ holidays: [] }))).toMatchObject({ kind: "welcome" });
    expect(decideAutomation([welcome], ctx({ channel: { id: "c1", botEnabled: false } }))).toMatchObject({ action: "none", reason: "bot_disabled" });
    expect(decideAutomation([welcome], ctx({ conversation: { botPaused: true } }))).toMatchObject({ action: "none", reason: "bot_paused" });
  });
});

describe("holiday admin", () => {
  const ok = { name: "ঈদ", startDate: "2026-03-20", endDate: "2026-03-22", text: "ছুটি" };

  it("adds, lists oldest first, edits, disables and deletes", async () => {
    expect((await addHoliday(t.db, { ...ok, name: "পরে", startDate: "2026-06-01", endDate: "2026-06-01" })).ok).toBe(true);
    expect((await addHoliday(t.db, ok)).ok).toBe(true);
    const list = await listHolidays(t.db);
    expect(list.map((x) => x.name)).toEqual(["ঈদ", "পরে"]);
    expect(list[0]).toMatchObject({ startDate: "2026-03-20", endDate: "2026-03-22", enabled: true });
    expect((await updateHoliday(t.db, list[0].id, { ...ok, text: "নতুন লেখা" })).ok).toBe(true);
    expect((await setHolidayEnabled(t.db, list[0].id, false)).ok).toBe(true);
    expect((await listHolidays(t.db))[0]).toMatchObject({ text: "নতুন লেখা", enabled: false });
    expect((await deleteHoliday(t.db, list[0].id)).ok).toBe(true);
    expect(await listHolidays(t.db)).toHaveLength(1);
  });

  it("rejects bad input", async () => {
    expect((await addHoliday(t.db, { ...ok, name: " " })).ok).toBe(false);
    expect((await addHoliday(t.db, { ...ok, text: "" })).ok).toBe(false);
    expect((await addHoliday(t.db, { ...ok, text: "x".repeat(1001) })).ok).toBe(false);
    expect((await addHoliday(t.db, { ...ok, startDate: "2026-02-30" })).ok).toBe(false);
    expect((await addHoliday(t.db, { ...ok, endDate: "2026-03-19" })).ok).toBe(false);
    expect((await addHoliday(t.db, { ...ok, startDate: "2026-01-01", endDate: "2026-12-31" })).ok).toBe(false);
    expect((await addHoliday(t.db, { ...ok, startDate: "2026-01-01", endDate: `2026-03-01` })).ok).toBe(true); // 60 days exactly is fine
    expect(MAX_HOLIDAY_DAYS).toBe(60);
  });

  it("unknown id is reported", async () => {
    const ghost = "00000000-0000-0000-0000-000000000000";
    expect((await updateHoliday(t.db, ghost, ok)).ok).toBe(false);
    expect((await setHolidayEnabled(t.db, ghost, true)).ok).toBe(false);
    expect((await deleteHoliday(t.db, ghost)).ok).toBe(false);
  });
});

describe("\"after hours only\" bot mode", () => {
  const welcome: Automation = { id: "w", kind: "welcome", priority: 10, channelId: null, config: { text: "স্বাগতম", idleHours: 72 } };
  const office: Automation = { id: "o", kind: "office_hours", priority: 40, channelId: null, config: { text: "এখন অফিস বন্ধ" } };
  const price: Automation = { id: "k1", kind: "keyword", priority: 20, channelId: null, config: { keywords: ["মূল্য"], match: "contains", reply: "ফি ৫০০০ টাকা" } };
  const OPEN = new Date("2026-03-10T08:00:00Z"); // 14:00 Dhaka, ordinary day
  const CLOSED = new Date("2026-03-10T20:00:00Z"); // 02:00 Dhaka
  const HOLIDAY_OPENHOURS = new Date("2026-03-21T08:00:00Z"); // 14:00 Dhaka, inside a holiday
  const ctx = (over: Partial<AutomationContext> = {}, text = "hello"): AutomationContext => ({
    channel: { id: "c1", botEnabled: true, afterHoursOnly: true },
    conversation: { botPaused: false },
    message: { direction: "inbound", source: "api", type: "text", text },
    inboundCount: 1,
    previousActivityAt: null,
    lastBotReplyAt: null,
    now: OPEN,
    office: { tz: "Asia/Dhaka", open: "10:00", close: "22:00" },
    holidays: [EID],
    ...over,
  });

  it("stays silent while the office is open, even for a keyword", () => {
    expect(decideAutomation([welcome, office, price], ctx())).toEqual({ action: "none", reason: "office_open" });
    expect(decideAutomation([welcome, office, price], ctx({}, "মূল্য কত"))).toEqual({ action: "none", reason: "office_open" });
  });

  it("answers outside office hours", () => {
    expect(decideAutomation([welcome, office, price], ctx({ now: CLOSED }))).toMatchObject({ action: "reply", kind: "office_hours" });
    expect(decideAutomation([welcome, office, price], ctx({ now: CLOSED }, "মূল্য কত"))).toMatchObject({ kind: "keyword" });
  });

  it("answers on a holiday even during normal office hours", () => {
    expect(decideAutomation([welcome, office], ctx({ now: HOLIDAY_OPENHOURS }))).toMatchObject({ action: "reply", kind: "holiday" });
  });

  it("the normal \"always\" mode still answers while open, and a disabled bot stays off", () => {
    expect(decideAutomation([welcome, office], ctx({ channel: { id: "c1", botEnabled: true, afterHoursOnly: false }, holidays: [] }))).toMatchObject({ kind: "welcome" });
    expect(decideAutomation([welcome, office], ctx({ now: CLOSED, channel: { id: "c1", botEnabled: false, afterHoursOnly: true } }))).toEqual({ action: "none", reason: "bot_disabled" });
  });
});

describe("bot mode setting", () => {
  it("maps the three modes to the two columns and back", () => {
    expect(botModeColumns("off")).toEqual({ botEnabled: false, botAfterHoursOnly: false });
    expect(botModeColumns("after_hours")).toEqual({ botEnabled: true, botAfterHoursOnly: true });
    expect(botModeColumns("always")).toEqual({ botEnabled: true, botAfterHoursOnly: false });
    for (const m of ["off", "after_hours", "always"] as const) expect(botModeOf(botModeColumns(m))).toBe(m);
    expect(isBotMode("sometimes")).toBe(false);
  });

  it("is saved on the channel, rejects bad modes, and plain 'on' clears after-hours-only", async () => {
    const [ch] = await t.db.insert(schema.channels).values({ type: "whatsapp", name: "WA", externalId: "PX", isTest: true }).returning();
    const read = async () => (await t.db.select().from(schema.channels).where(eq(schema.channels.id, ch.id)))[0];
    expect(botModeOf(await read())).toBe("off");
    expect((await setBotMode(t.db, ch.id, "after_hours")).ok).toBe(true);
    expect(botModeOf(await read())).toBe("after_hours");
    expect((await setBotMode(t.db, ch.id, "bogus")).ok).toBe(false);
    expect(botModeOf(await read())).toBe("after_hours");
    expect((await setBotEnabled(t.db, ch.id, true)).ok).toBe(true);
    expect(botModeOf(await read())).toBe("always");
    expect((await setBotMode(t.db, "00000000-0000-0000-0000-000000000000", "always")).ok).toBe(false);
    await t.db.delete(schema.channels);
  });
});
