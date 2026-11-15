import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";
import { type OfficeHours, officeHoursFromEnv } from "../automation/office-hours";
import { numberFormat, type Locale } from "@/lib/i18n";

export interface SlaHoliday {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  enabled: boolean;
}

export interface SlaBadge {
  waitMinutes: number;
  label: string;
  color: "green" | "yellow" | "red";
}

/**
 * Loads all currently enabled holidays from the database.
 */
export async function loadActiveHolidays(db: Db): Promise<SlaHoliday[]> {
  const rows = await db
    .select({
      startDate: schema.holidays.startDate,
      endDate: schema.holidays.endDate,
      enabled: schema.holidays.enabled,
    })
    .from(schema.holidays)
    .where(eq(schema.holidays.enabled, true));

  return rows;
}

/**
 * Calculates effective business minutes elapsed between customer's message and now.
 * Only minutes within office hours (e.g. 10:00-22:00 Asia/Dhaka) are counted.
 * Holidays (from holidays table) contribute 0 minutes.
 * Overnights (outside 10:00-22:00) contribute 0 minutes.
 */
export function calculateBusinessWaitMinutes(
  lastCustomerMessageAt: Date,
  now: Date,
  hours: OfficeHours = officeHoursFromEnv(),
  holidays: SlaHoliday[] = [],
): number {
  if (now.getTime() <= lastCustomerMessageAt.getTime()) {
    return 0;
  }

  const [openHour, openMin] = hours.open.split(":").map(Number);
  const [closeHour, closeMin] = hours.close.split(":").map(Number);
  const dailyWorkMinutes = (closeHour * 60 + closeMin) - (openHour * 60 + openMin);
  if (dailyWorkMinutes <= 0) return 0;

  // Helper to check if a YYYY-MM-DD date string falls on an active holiday
  const isHoliday = (dateStr: string) => {
    return holidays.some(
      (h) => h.enabled && dateStr >= h.startDate && dateStr <= h.endDate,
    );
  };

  // Convert Date to local parts in the configured timeZone
  const getLocalParts = (d: Date) => {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: hours.tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(d);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || "00";

    const dateStr = `${get("year")}-${get("month")}-${get("day")}`;
    const minuteOfDay = parseInt(get("hour"), 10) * 60 + parseInt(get("minute"), 10);
    return { dateStr, minuteOfDay };
  };

  const start = getLocalParts(lastCustomerMessageAt);
  const end = getLocalParts(now);

  const openMinuteOfDay = openHour * 60 + openMin;
  const closeMinuteOfDay = closeHour * 60 + closeMin;

  const clampWorkMinutes = (m: number) => {
    return Math.max(openMinuteOfDay, Math.min(closeMinuteOfDay, m));
  };

  // Case 1: Same calendar day in local tz
  if (start.dateStr === end.dateStr) {
    if (isHoliday(start.dateStr)) return 0;

    const startM = clampWorkMinutes(start.minuteOfDay);
    const endM = clampWorkMinutes(end.minuteOfDay);
    return Math.max(0, endM - startM);
  }

  // Case 2: Multi-day span
  let totalMinutes = 0;

  // First day: from start time until close
  if (!isHoliday(start.dateStr)) {
    const startM = clampWorkMinutes(start.minuteOfDay);
    totalMinutes += Math.max(0, closeMinuteOfDay - startM);
  }

  // Intermediate full days
  const dStart = new Date(start.dateStr + "T00:00:00Z");
  const dEnd = new Date(end.dateStr + "T00:00:00Z");
  const numDays = Math.round((dEnd.getTime() - dStart.getTime()) / (24 * 3600 * 1000));

  for (let i = 1; i < numDays; i++) {
    const cur = new Date(dStart.getTime() + i * 24 * 3600 * 1000);
    const curStr = cur.toISOString().slice(0, 10);
    if (!isHoliday(curStr)) {
      totalMinutes += dailyWorkMinutes;
    }
  }

  // Last day: from open until now
  if (!isHoliday(end.dateStr)) {
    const endM = clampWorkMinutes(end.minuteOfDay);
    totalMinutes += Math.max(0, endM - openMinuteOfDay);
  }

  return totalMinutes;
}

/**
 * Returns a human-friendly SLA badge with appropriate color and localized numerals.
 * < 5 min: Green
 * 5 - 15 min: Yellow
 * > 15 min: Red
 */
export function getSlaBadge(waitMinutes: number, locale: Locale = "bn"): SlaBadge {
  const nf = numberFormat(locale);
  const num = (n: number) => nf.format(n);
  let label = "";

  if (waitMinutes < 1) {
    label = locale === "bn" ? "এইমাত্র" : "just now";
  } else if (waitMinutes < 60) {
    label = locale === "bn" ? `${num(waitMinutes)}মি অপেক্ষা` : `${num(waitMinutes)}m wait`;
  } else {
    const hours = Math.floor(waitMinutes / 60);
    const mins = waitMinutes % 60;
    label = locale === "bn"
      ? (mins > 0 ? `${num(hours)}ঘ ${num(mins)}মি অপেক্ষা` : `${num(hours)}ঘ অপেক্ষা`)
      : (mins > 0 ? `${num(hours)}h ${num(mins)}m wait` : `${num(hours)}h wait`);
  }

  let color: "green" | "yellow" | "red" = "green";
  if (waitMinutes > 15) {
    color = "red";
  } else if (waitMinutes >= 5) {
    color = "yellow";
  }

  return { waitMinutes, label, color };
}
