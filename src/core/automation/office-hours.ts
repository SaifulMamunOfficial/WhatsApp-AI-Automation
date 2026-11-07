export interface OfficeHours {
  /** IANA time zone, e.g. Asia/Dhaka. */
  tz: string;
  /** "HH:mm" 24h. */
  open: string;
  close: string;
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function minutes(hhmm: string): number | null {
  const m = HHMM.exec(hhmm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Office hours from the environment (CLAUDE.md: 10:00-22:00 Asia/Dhaka). */
export function officeHoursFromEnv(env: Record<string, string | undefined> = process.env): OfficeHours {
  const cfg = { tz: env.OFFICE_TZ || "Asia/Dhaka", open: env.OFFICE_OPEN || "10:00", close: env.OFFICE_CLOSE || "22:00" };
  // Fall back to the documented defaults on bad values instead of failing every message.
  return minutes(cfg.open) === null || minutes(cfg.close) === null ? { tz: cfg.tz, open: "10:00", close: "22:00" } : cfg;
}

function localMinutes(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return h * 60 + m;
}

/** Open from `open` (inclusive) to `close` (exclusive). Handles hours that wrap past midnight. */
export function isWithinOfficeHours(now: Date, hours: OfficeHours): boolean {
  const open = minutes(hours.open);
  const close = minutes(hours.close);
  if (open === null || close === null || open === close) return true; // misconfigured: never block replies
  const t = localMinutes(now, hours.tz);
  return open < close ? t >= open && t < close : t >= open || t < close;
}
