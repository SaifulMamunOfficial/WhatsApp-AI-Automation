// Pure holiday logic (no database), shared by the bot's decision engine and the admin code.

export interface Holiday {
  id: string;
  name: string;
  /** Calendar day "YYYY-MM-DD" in the office time zone, inclusive. */
  startDate: string;
  endDate: string;
  text: string;
}

const dayFmt = new Map<string, Intl.DateTimeFormat>();

/** Today's calendar date "YYYY-MM-DD" in `tz` (not the server's time zone). */
export function localDate(now: Date, tz: string): string {
  let f = dayFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFmt.set(tz, f);
  }
  return f.format(now);
}

/** The holiday covering `now` (calendar day in `tz`), or undefined. The earliest-starting wins. */
export function activeHoliday(now: Date, tz: string, holidays: Holiday[]): Holiday | undefined {
  const today = localDate(now, tz);
  return [...holidays].sort((a, b) => a.startDate.localeCompare(b.startDate)).find((h) => h.startDate <= today && today <= h.endDate);
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Whole days from `a` to `b` (both YYYY-MM-DD), positive when b is later. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
