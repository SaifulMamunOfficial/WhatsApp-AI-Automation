import { describe, expect, it } from "vitest";
import { matchesKeyword, normalizeText } from "@/core/automation/text";
import { isWithinOfficeHours, officeHoursFromEnv } from "@/core/automation/office-hours";
import { parseAutomation, type Automation } from "@/core/automation/config";
import { decideAutomation, OFFICE_REPLY_COOLDOWN_MS, type AutomationContext } from "@/core/automation/engine";

describe("normalizeText / matchesKeyword", () => {
  it("normalizes case, Bengali digits, punctuation and spacing", () => {
    expect(normalizeText("  ১।  ")).toBe("1");
    expect(normalizeText("Price?!")).toBe("price");
    expect(normalizeText("মূল্য কত ?")).toBe("মূল্য কত");
    expect(normalizeText("")).toBe("");
  });

  it("matches whole words, so '1' does not match '150'", () => {
    expect(matchesKeyword("আমি ১ চাই", ["1"], "contains")).toBe(true);
    expect(matchesKeyword("দাম 150 টাকা", ["1"], "contains")).toBe(false);
    expect(matchesKeyword("মূল্য জানতে চাই", ["মূল্য"], "contains")).toBe(true);
    expect(matchesKeyword("what is the PRICE", ["price"], "contains")).toBe(true);
    expect(matchesKeyword("pricelist", ["price"], "contains")).toBe(false);
  });

  it("exact mode needs the whole message; empty input never matches", () => {
    expect(matchesKeyword("menu", ["Menu"], "exact")).toBe(true);
    expect(matchesKeyword("show menu please", ["menu"], "exact")).toBe(false);
    expect(matchesKeyword("   ", ["menu"], "contains")).toBe(false);
    expect(matchesKeyword("hi", ["", "  "], "contains")).toBe(false);
  });
});

describe("isWithinOfficeHours (Asia/Dhaka 10:00-22:00)", () => {
  const hours = { tz: "Asia/Dhaka", open: "10:00", close: "22:00" };
  // Dhaka is UTC+6, no DST.
  const at = (utc: string) => new Date(utc);

  it("is open from 10:00 (inclusive) to 22:00 (exclusive) in Dhaka time", () => {
    expect(isWithinOfficeHours(at("2026-03-10T03:59:00Z"), hours)).toBe(false); // 09:59
    expect(isWithinOfficeHours(at("2026-03-10T04:00:00Z"), hours)).toBe(true); // 10:00
    expect(isWithinOfficeHours(at("2026-03-10T15:59:00Z"), hours)).toBe(true); // 21:59
    expect(isWithinOfficeHours(at("2026-03-10T16:00:00Z"), hours)).toBe(false); // 22:00
    expect(isWithinOfficeHours(at("2026-03-10T20:30:00Z"), hours)).toBe(false); // 02:30 next day
  });

  it("handles hours that wrap past midnight, and never blocks on bad config", () => {
    const night = { tz: "UTC", open: "22:00", close: "06:00" };
    expect(isWithinOfficeHours(at("2026-03-10T23:00:00Z"), night)).toBe(true);
    expect(isWithinOfficeHours(at("2026-03-10T05:59:00Z"), night)).toBe(true);
    expect(isWithinOfficeHours(at("2026-03-10T12:00:00Z"), night)).toBe(false);
    expect(isWithinOfficeHours(at("2026-03-10T12:00:00Z"), { tz: "UTC", open: "xx", close: "yy" })).toBe(true);
    expect(isWithinOfficeHours(at("2026-03-10T12:00:00Z"), { tz: "UTC", open: "10:00", close: "10:00" })).toBe(true);
  });

  it("reads the environment with safe defaults", () => {
    expect(officeHoursFromEnv({})).toEqual({ tz: "Asia/Dhaka", open: "10:00", close: "22:00" });
    expect(officeHoursFromEnv({ OFFICE_OPEN: "09:00", OFFICE_CLOSE: "18:30", OFFICE_TZ: "UTC" })).toEqual({ tz: "UTC", open: "09:00", close: "18:30" });
    expect(officeHoursFromEnv({ OFFICE_OPEN: "nope" }).open).toBe("10:00");
  });
});

describe("parseAutomation", () => {
  const row = (kind: "welcome" | "keyword" | "office_hours", config: unknown) => ({ id: "a", kind, priority: 1, channelId: null, config });
  it("accepts valid configs with defaults and rejects malformed ones", () => {
    expect(parseAutomation(row("welcome", { text: "স্বাগতম" }))).toMatchObject({ kind: "welcome", config: { text: "স্বাগতম", idleHours: 72 } });
    expect(parseAutomation(row("keyword", { keywords: ["1"], reply: "x" }))).toMatchObject({ config: { match: "contains" } });
    expect(parseAutomation(row("welcome", {}))).toBeNull();
    expect(parseAutomation(row("keyword", { keywords: [], reply: "x" }))).toBeNull();
    expect(parseAutomation(row("office_hours", { text: "   " }))).toBeNull();
    expect(parseAutomation(row("keyword", "garbage"))).toBeNull();
  });
});

describe("decideAutomation", () => {
  const welcome: Automation = { id: "w", kind: "welcome", priority: 10, channelId: null, config: { text: "স্বাগতম", idleHours: 72 } };
  const price: Automation = { id: "k1", kind: "keyword", priority: 20, channelId: null, config: { keywords: ["1", "মূল্য"], match: "contains", reply: "ফি ৫০০০ টাকা" } };
  const menu: Automation = { id: "k2", kind: "keyword", priority: 30, channelId: null, config: { keywords: ["menu", "মেনু"], match: "exact", reply: "১ মূল্য\n২ ঠিকানা" } };
  const office: Automation = { id: "o", kind: "office_hours", priority: 40, channelId: null, config: { text: "এখন অফিস বন্ধ" } };
  const all = [office, menu, price, welcome];

  const OPEN = new Date("2026-03-10T08:00:00Z"); // 14:00 Dhaka
  const CLOSED = new Date("2026-03-10T20:00:00Z"); // 02:00 Dhaka (+1)
  const ctx = (over: Partial<AutomationContext> = {}, text = "hello"): AutomationContext => ({
    channel: { id: "ch1", botEnabled: true },
    conversation: { botPaused: false },
    message: { direction: "inbound", source: "api", type: "text", text },
    inboundCount: 1,
    previousActivityAt: null,
    lastBotReplyAt: null,
    now: OPEN,
    office: { tz: "Asia/Dhaka", open: "10:00", close: "22:00" },
    ...over,
  });
  const reply = (d: ReturnType<typeof decideAutomation>) => (d.action === "reply" ? `${d.kind}:${d.text}` : d.action === "ai" ? "ai" : `none:${d.reason}`);

  it("is silent when the bot is off or a human took over", () => {
    expect(reply(decideAutomation(all, ctx({ channel: { id: "ch1", botEnabled: false } })))).toBe("none:bot_disabled");
    expect(reply(decideAutomation(all, ctx({ conversation: { botPaused: true } })))).toBe("none:bot_paused");
  });

  it("ignores history, echoes and our own messages", () => {
    expect(reply(decideAutomation(all, ctx({ message: { direction: "inbound", source: "history", type: "text", text: "1" } })))).toBe("none:not_a_live_customer_message");
    expect(reply(decideAutomation(all, ctx({ message: { direction: "outbound", source: "phone_app", type: "text", text: "1" } })))).toBe("none:not_a_live_customer_message");
    expect(reply(decideAutomation(all, ctx({ message: { direction: "outbound", source: "api", type: "text", text: "1" } })))).toBe("none:not_a_live_customer_message");
  });

  it("answers keywords, matching Bengali digits and by priority", () => {
    expect(reply(decideAutomation(all, ctx({}, "১")))).toBe("keyword:ফি ৫০০০ টাকা");
    expect(reply(decideAutomation(all, ctx({ inboundCount: 5, previousActivityAt: OPEN }, "মূল্য কত?")))).toBe("keyword:ফি ৫০০০ টাকা");
    expect(reply(decideAutomation(all, ctx({ inboundCount: 5, previousActivityAt: OPEN }, "মেনু")))).toBe("keyword:১ মূল্য\n২ ঠিকানা");
  });

  it("sends only ONE reply: a keyword beats the welcome on a first message", () => {
    expect(reply(decideAutomation(all, ctx({}, "1")))).toContain("keyword:");
  });

  it("welcomes first-time customers only, and returning ones after the idle period", () => {
    expect(reply(decideAutomation(all, ctx()))).toBe("welcome:স্বাগতম");
    const day = 24 * 3600_000;
    expect(reply(decideAutomation(all, ctx({ inboundCount: 2, previousActivityAt: new Date(OPEN.getTime() - 1 * day) })))).toBe("none:nothing_matched");
    expect(reply(decideAutomation(all, ctx({ inboundCount: 2, previousActivityAt: new Date(OPEN.getTime() - 4 * day) })))).toBe("welcome:স্বাগতম");
    // An existing customer (imported history) writing for the first live time is not "new".
    expect(reply(decideAutomation(all, ctx({ inboundCount: 1, previousActivityAt: new Date(OPEN.getTime() - 30 * 60_000) })))).toBe("none:nothing_matched");
  });

  it("after hours: a keyword still answers; otherwise one notice (replacing the welcome), rate limited", () => {
    expect(reply(decideAutomation(all, ctx({ now: CLOSED }, "1")))).toContain("keyword:");
    expect(reply(decideAutomation(all, ctx({ now: CLOSED }, "hello")))).toBe("office_hours:এখন অফিস বন্ধ");
    const recent = new Date(CLOSED.getTime() - 3600_000);
    expect(reply(decideAutomation(all, ctx({ now: CLOSED, lastBotReplyAt: recent }, "hello")))).toBe("none:already_replied");
    const old = new Date(CLOSED.getTime() - OFFICE_REPLY_COOLDOWN_MS - 1000);
    expect(reply(decideAutomation(all, ctx({ now: CLOSED, lastBotReplyAt: old }, "hello")))).toBe("office_hours:এখন অফিস বন্ধ");
  });

  it("during office hours there is no after-hours notice", () => {
    const withoutWelcome = [office, price];
    expect(reply(decideAutomation(withoutWelcome, ctx({}, "hello")))).toBe("none:nothing_matched");
  });

  it("non-text messages get no keyword answer but still the welcome / after-hours notice", () => {
    const image = (now: Date) => ctx({ now, message: { direction: "inbound", source: "api", type: "image", text: "1" } });
    expect(reply(decideAutomation(all, image(OPEN)))).toBe("welcome:স্বাগতম");
    expect(reply(decideAutomation(all, image(CLOSED)))).toBe("office_hours:এখন অফিস বন্ধ");
  });

  it("scopes rules to a channel", () => {
    const onlyOther: Automation = { ...price, id: "k3", channelId: "other" };
    expect(reply(decideAutomation([onlyOther], ctx({ inboundCount: 5, previousActivityAt: OPEN }, "1")))).toBe("none:nothing_matched");
    const onlyThis: Automation = { ...price, id: "k4", channelId: "ch1" };
    expect(reply(decideAutomation([onlyThis], ctx({ inboundCount: 5, previousActivityAt: OPEN }, "1")))).toContain("keyword:");
  });
});
