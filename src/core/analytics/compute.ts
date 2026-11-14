import { isWithinOfficeHours, type OfficeHours } from "@/core/automation/office-hours";

// Pure analytics over stored messages (no database): response times, work per agent and the
// busiest times. Everything is computed in the office time zone (Asia/Dhaka).
//
// How "response time" is measured
//  - A customer WAITS from a live customer message until the next HUMAN reply in that conversation.
//    Human = a CRM agent, or someone answering from the phone app / Page inbox. The bot does not
//    stop the wait (it answers instantly and would hide how long people really wait), and broadcast
//    template sends are not replies.
//  - Only waits that BEGAN inside office hours count: a message at 2 a.m. is expected to wait until morning.
//  - Waits still open are counted as "unanswered", not averaged.

export interface MsgRow {
  conversationId: string;
  direction: "inbound" | "outbound";
  source: string;
  sentByBot: boolean;
  sentByUserId: string | null;
  sentAt: Date;
}

export interface AgentStats {
  /** null = replies sent from the phone app / Page inbox, where we do not know who answered. */
  userId: string | null;
  replies: number;
  conversations: number;
  waits: number;
  avgMinutes: number | null;
}

export interface Analytics {
  inbound: number;
  humanReplies: number;
  botReplies: number;
  /** Waits that began inside office hours and got a human reply. */
  answeredWaits: number;
  avgMinutes: number | null;
  medianMinutes: number | null;
  /** Share (0..1) of answered waits that got a human reply within 60 minutes. */
  within60Share: number | null;
  /** Waits that began inside office hours and have no human reply yet. */
  unanswered: number;
  agents: AgentStats[];
  /** Customer messages per hour of day (0..23). */
  byHour: number[];
  /** Customer messages per weekday, Monday first (0 = Mon ... 6 = Sun). */
  byWeekday: number[];
  /** heat[weekday][hour] = customer messages. */
  heat: number[][];
  peak: { weekday: number; hour: number; count: number } | null;
}

const WEEKDAY: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const partsFmt = new Map<string, Intl.DateTimeFormat>();

/** Weekday (Mon=0) and hour (0..23) of an instant in `tz`. */
export function localSlot(at: Date, tz: string): { weekday: number; hour: number } {
  let f = partsFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", hourCycle: "h23" });
    partsFmt.set(tz, f);
  }
  const parts = f.formatToParts(at);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hr = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  return { weekday: WEEKDAY[wd] ?? 0, hour: hr % 24 };
}

const isLiveCustomer = (m: MsgRow) => m.direction === "inbound" && m.source === "api";
const isHumanReply = (m: MsgRow) => m.direction === "outbound" && !m.sentByBot && (m.sentByUserId !== null || m.source === "phone_app" || m.source === "page_inbox");

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function computeAnalytics(rows: MsgRow[], office: OfficeHours): Analytics {
  const heat = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let inbound = 0;
  let humanReplies = 0;
  let botReplies = 0;

  const byConversation = new Map<string, MsgRow[]>();
  for (const m of rows) {
    if (m.source === "history") continue;
    if (isLiveCustomer(m)) {
      inbound++;
      const s = localSlot(m.sentAt, office.tz);
      heat[s.weekday][s.hour]++;
    } else if (isHumanReply(m)) humanReplies++;
    else if (m.direction === "outbound" && m.sentByBot) botReplies++;
    const list = byConversation.get(m.conversationId);
    if (list) list.push(m);
    else byConversation.set(m.conversationId, [m]);
  }

  const waits: number[] = [];
  let unanswered = 0;
  const agent = new Map<string | null, { replies: number; conversations: Set<string>; waits: number[] }>();
  const agentOf = (id: string | null) => {
    let a = agent.get(id);
    if (!a) agent.set(id, (a = { replies: 0, conversations: new Set(), waits: [] }));
    return a;
  };

  for (const [conversationId, list] of byConversation) {
    list.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
    let waitingSince: Date | null = null;
    for (const m of list) {
      if (isLiveCustomer(m)) {
        waitingSince ??= m.sentAt;
      } else if (isHumanReply(m)) {
        const a = agentOf(m.sentByUserId);
        a.replies++;
        a.conversations.add(conversationId);
        if (waitingSince) {
          if (isWithinOfficeHours(waitingSince, office)) {
            const minutes = (m.sentAt.getTime() - waitingSince.getTime()) / 60_000;
            waits.push(minutes);
            a.waits.push(minutes);
          }
          waitingSince = null;
        }
      }
    }
    if (waitingSince && isWithinOfficeHours(waitingSince, office)) unanswered++;
  }

  const byHour = new Array<number>(24).fill(0);
  const byWeekday = new Array<number>(7).fill(0);
  let peak: Analytics["peak"] = null;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const n = heat[d][h];
      byHour[h] += n;
      byWeekday[d] += n;
      if (n > 0 && (!peak || n > peak.count)) peak = { weekday: d, hour: h, count: n };
    }
  }

  const agents: AgentStats[] = [...agent.entries()]
    .map(([userId, a]) => ({ userId, replies: a.replies, conversations: a.conversations.size, waits: a.waits.length, avgMinutes: mean(a.waits) }))
    .sort((x, y) => y.replies - x.replies);

  return {
    inbound,
    humanReplies,
    botReplies,
    answeredWaits: waits.length,
    avgMinutes: mean(waits),
    medianMinutes: median(waits),
    within60Share: waits.length ? waits.filter((w) => w <= 60).length / waits.length : null,
    unanswered,
    agents,
    byHour,
    byWeekday,
    heat,
    peak,
  };
}
