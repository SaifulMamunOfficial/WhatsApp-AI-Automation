import { and, count, desc, eq, gte, ne, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";

const TZ = "Asia/Dhaka";
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }); // YYYY-MM-DD
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DayPoint {
  /** YYYY-MM-DD in Asia/Dhaka. */
  date: string;
  /** Messages from customers. */
  inbound: number;
  /** Replies sent by staff (CRM, phone app, page inbox). */
  human: number;
  /** Replies sent by the bot. */
  bot: number;
}

export interface DashboardStats {
  open: number;
  unread: number;
  needsHuman: number;
  unassigned: number;
  todayInbound: number;
  todayReplies: number;
  contactsTotal: number;
  contactsNew7: number;
  optedIn: number;
  /** Oldest first, always 7 entries ending today (Asia/Dhaka). */
  days: DayPoint[];
  /** Bot replies / all replies over the 7 days, 0..1 (null when there were no replies). */
  botShare: number | null;
  channels: { id: string; name: string; type: "whatsapp" | "messenger"; status: string; botEnabled: boolean; botAfterHoursOnly: boolean; isTest: boolean; open: number }[];
  lastBroadcast: { id: string; name: string; status: string; total: number; sent: number; failed: number; createdAt: Date } | null;
}

/** The last `n` Dhaka calendar days ending at `now`, oldest first, as YYYY-MM-DD. */
export function lastDays(now: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => dayFmt.format(new Date(now.getTime() - (n - 1 - i) * DAY_MS)));
}

/**
 * Numbers for the dashboard. History imports are excluded from message counts (they are old
 * chats, not today's work). `now` is a parameter so tests are deterministic.
 */
export async function getDashboardStats(db: Db, now = new Date()): Promise<DashboardStats> {
  const m = schema.messages;
  const cv = schema.conversations;
  const days = lastDays(now, 7);
  // 8 days back is a safe lower bound for the 7 Dhaka days (timezone offset); exact bucketing is by day key.
  const since = new Date(now.getTime() - 8 * DAY_MS);

  const dayKey = sql<string>`to_char(${m.sentAt} AT TIME ZONE ${sql.raw(`'${TZ}'`)}, 'YYYY-MM-DD')`; // constant, inlined so SELECT and GROUP BY match
  const [rows, openRow, unreadRow, humanRow, unassignedRow, contactsRow, newContactsRow, optedRow, channelRows, openByChannel, broadcastRows] =
    await Promise.all([
      db
        .select({
          day: dayKey,
          inbound: sql<number>`count(*) filter (where ${m.direction} = 'inbound')::int`,
          bot: sql<number>`count(*) filter (where ${m.direction} = 'outbound' and ${m.sentByBot})::int`,
          human: sql<number>`count(*) filter (where ${m.direction} = 'outbound' and not ${m.sentByBot})::int`,
        })
        .from(m)
        .where(and(gte(m.sentAt, since), ne(m.source, "history")))
        .groupBy(dayKey),
      db.select({ n: count() }).from(cv).where(eq(cv.status, "open")),
      db.select({ n: count() }).from(cv).where(and(eq(cv.status, "open"), sql`${cv.unreadCount} > 0`)),
      db.select({ n: count() }).from(cv).where(and(eq(cv.status, "open"), eq(cv.needsHuman, true))),
      db.select({ n: count() }).from(cv).where(and(eq(cv.status, "open"), sql`${cv.assignedUserId} is null`)),
      db.select({ n: count() }).from(schema.contacts),
      db.select({ n: count() }).from(schema.contacts).where(gte(schema.contacts.createdAt, new Date(now.getTime() - 7 * DAY_MS))),
      db.select({ n: count() }).from(schema.contacts).where(eq(schema.contacts.optedIn, true)),
      db.select().from(schema.channels).orderBy(schema.channels.createdAt),
      db.select({ channelId: cv.channelId, n: count() }).from(cv).where(eq(cv.status, "open")).groupBy(cv.channelId),
      db.select().from(schema.broadcasts).orderBy(desc(schema.broadcasts.createdAt)).limit(1),
    ]);

  const byDay = new Map(rows.map((r) => [r.day, r]));
  const points: DayPoint[] = days.map((date) => {
    const r = byDay.get(date);
    return { date, inbound: r?.inbound ?? 0, human: r?.human ?? 0, bot: r?.bot ?? 0 };
  });
  const today = points[points.length - 1];
  const bot = points.reduce((s, p) => s + p.bot, 0);
  const replies = points.reduce((s, p) => s + p.bot + p.human, 0);
  const openMap = new Map(openByChannel.map((r) => [r.channelId, r.n]));
  const b = broadcastRows[0];

  return {
    open: openRow[0].n,
    unread: unreadRow[0].n,
    needsHuman: humanRow[0].n,
    unassigned: unassignedRow[0].n,
    todayInbound: today.inbound,
    todayReplies: today.bot + today.human,
    contactsTotal: contactsRow[0].n,
    contactsNew7: newContactsRow[0].n,
    optedIn: optedRow[0].n,
    days: points,
    botShare: replies === 0 ? null : bot / replies,
    channels: channelRows.map((c) => ({
      id: c.id, name: c.name, type: c.type, status: c.status, botEnabled: c.botEnabled, botAfterHoursOnly: c.botAfterHoursOnly, isTest: c.isTest, open: openMap.get(c.id) ?? 0,
    })),
    lastBroadcast: b ? { id: b.id, name: b.name, status: b.status, total: b.totalCount, sent: b.sentCount, failed: b.failedCount, createdAt: b.createdAt } : null,
  };
}
