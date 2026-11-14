import type { Automation } from "./config";
import { matchesKeyword } from "./text";
import { activeHoliday, type Holiday } from "./holiday-rules";
import { isWithinOfficeHours, type OfficeHours } from "./office-hours";

// Pure decision logic: given the facts, what (if anything) should the bot answer?
// No database, no network. Everything that can go wrong in production is decided here
// and covered by tests.

export interface AutomationContext {
  channel: { id: string; botEnabled: boolean; /** Answer only while the office is closed. */ afterHoursOnly?: boolean };
  conversation: { botPaused: boolean };
  message: { direction: "inbound" | "outbound"; source: string; type: string; text?: string | null };
  /** Live inbound messages in this conversation, including this one. */
  inboundCount: number;
  /** Time of the latest earlier message of any kind, or null if this is the first. */
  previousActivityAt: Date | null;
  /** Time of the latest bot reply in this conversation, or null. */
  lastBotReplyAt: Date | null;
  now: Date;
  office: OfficeHours;
  /** Enabled closed days. While one covers today (in the office time zone) its text replaces the after-hours notice and the welcome. */
  holidays?: Holiday[];
  /** An AI provider is configured and the knowledge base has articles. Defaults to false. */
  aiAvailable?: boolean;
}

export type Decision =
  | { action: "reply"; text: string; automationId: string; kind: Automation["kind"] | "holiday" }
  /** Ask the AI (grounded in the knowledge base); the runner handles answer/handoff/failure. */
  | { action: "ai"; automationId: string; handoffText: string; maxRepliesPerHour: number }
  | { action: "none"; reason: NoReplyReason };

export type NoReplyReason =
  | "bot_disabled"
  | "bot_paused"
  | "office_open"
  | "not_a_live_customer_message"
  | "nothing_matched"
  | "already_replied";

/** After-hours notices are sent at most this often per conversation. */
export const OFFICE_REPLY_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/**
 * Rules, in order:
 *  1. Never when the channel's bot is off, or a human has taken over the conversation
 *     (a reply from the phone/page inbox/CRM sets bot_paused).
 *  2. Only for live inbound customer messages (not history, not our own messages).
 *  3. At most ONE automated reply per customer message. Priority:
 *       keyword rule  >  AI answer (when enabled)  >  holiday notice  >  after-hours notice  >  welcome.
 *     A keyword answer is useful even after hours; the holiday / after-hours notice replaces the
 *     welcome so the customer never gets two messages at once. Notices are sent at most once per 12 hours.
 */
export function decideAutomation(automations: Automation[], ctx: AutomationContext): Decision {
  if (!ctx.channel.botEnabled) return { action: "none", reason: "bot_disabled" };
  if (ctx.conversation.botPaused) return { action: "none", reason: "bot_paused" };
  if (ctx.message.direction !== "inbound" || ctx.message.source !== "api") {
    return { action: "none", reason: "not_a_live_customer_message" };
  }

  // "After hours only" mode: while the office is open (inside office hours and not a holiday) people answer, not the bot.
  if (ctx.channel.afterHoursOnly) {
    const closed = !isWithinOfficeHours(ctx.now, ctx.office) || !!activeHoliday(ctx.now, ctx.office.tz, ctx.holidays ?? []);
    if (!closed) return { action: "none", reason: "office_open" };
  }

  const applicable = automations
    .filter((a) => a.channelId === null || a.channelId === ctx.channel.id)
    .sort((a, b) => a.priority - b.priority);

  // 1) keyword rules (text only)
  const text = ctx.message.type === "text" || ctx.message.type === "postback" || ctx.message.type === "button" || ctx.message.type === "interactive" ? ctx.message.text : null;
  if (text) {
    for (const a of applicable) {
      if (a.kind === "keyword" && matchesKeyword(text, a.config.keywords, a.config.match)) {
        return { action: "reply", text: a.config.reply, automationId: a.id, kind: "keyword" };
      }
    }
  }

  // 2) AI answer from the knowledge base (text only), before the generic notices
  if (text && ctx.aiAvailable) {
    const ai = applicable.find((a) => a.kind === "ai");
    if (ai) return { action: "ai", automationId: ai.id, handoffText: ai.config.handoffText, maxRepliesPerHour: ai.config.maxRepliesPerHour };
  }

  // 3a) holiday notice: the office is closed all day, so this wins over the after-hours notice
  const holiday = activeHoliday(ctx.now, ctx.office.tz, ctx.holidays ?? []);
  if (holiday) {
    const recentlySent = ctx.lastBotReplyAt && ctx.now.getTime() - ctx.lastBotReplyAt.getTime() < OFFICE_REPLY_COOLDOWN_MS;
    if (recentlySent) return { action: "none", reason: "already_replied" };
    return { action: "reply", text: holiday.text, automationId: holiday.id, kind: "holiday" };
  }

  // 3b) after-hours notice
  if (!isWithinOfficeHours(ctx.now, ctx.office)) {
    const office = applicable.find((a) => a.kind === "office_hours");
    if (office) {
      const recentlySent = ctx.lastBotReplyAt && ctx.now.getTime() - ctx.lastBotReplyAt.getTime() < OFFICE_REPLY_COOLDOWN_MS;
      if (recentlySent) return { action: "none", reason: "already_replied" };
      return { action: "reply", text: office.config.text, automationId: office.id, kind: "office_hours" };
    }
  }

  // 4) welcome: first message ever, or the customer returns after a long silence
  const welcome = applicable.find((a) => a.kind === "welcome");
  if (welcome) {
    const isFirst = ctx.inboundCount <= 1 && ctx.previousActivityAt === null;
    const returned = ctx.previousActivityAt !== null && ctx.now.getTime() - ctx.previousActivityAt.getTime() >= welcome.config.idleHours * HOUR;
    if (isFirst || returned) return { action: "reply", text: welcome.config.text, automationId: welcome.id, kind: "welcome" };
  }

  return { action: "none", reason: "nothing_matched" };
}
