import { desc, gte, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";
import { officeHoursFromEnv, type OfficeHours } from "@/core/automation/office-hours";
import { computeAnalytics, type Analytics, type MsgRow } from "./compute";

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

/** Safety cap: with this many messages in range only the newest are analysed (and the page says so). */
export const MAX_ROWS = 200_000;

export interface AnalyticsReport {
  days: AnalyticsRange;
  analytics: Analytics;
  /** userId -> name for the agents in the report. */
  names: Record<string, string>;
  truncated: boolean;
  office: OfficeHours;
}

export function parseRange(v: string | undefined): AnalyticsRange {
  const n = Number(v);
  return (ANALYTICS_RANGES as readonly number[]).includes(n) ? (n as AnalyticsRange) : 30;
}

export async function getAnalytics(db: Db, days: AnalyticsRange, now = new Date(), office = officeHoursFromEnv()): Promise<AnalyticsReport> {
  const m = schema.messages;
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await db
    .select({ conversationId: m.conversationId, direction: m.direction, source: m.source, sentByBot: m.sentByBot, sentByUserId: m.sentByUserId, sentAt: m.sentAt })
    .from(m)
    .where(gte(m.sentAt, since))
    .orderBy(desc(m.sentAt))
    .limit(MAX_ROWS + 1);
  const truncated = rows.length > MAX_ROWS;
  const used: MsgRow[] = (truncated ? rows.slice(0, MAX_ROWS) : rows) as MsgRow[];

  const analytics = computeAnalytics(used, office);
  const ids = analytics.agents.map((a) => a.userId).filter((x): x is string => !!x);
  const names: Record<string, string> = {};
  if (ids.length) {
    for (const u of await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, ids))) names[u.id] = u.name;
  }
  return { days, analytics, names, truncated, office };
}
