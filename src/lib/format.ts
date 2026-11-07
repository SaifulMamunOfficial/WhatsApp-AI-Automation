const TZ = "Asia/Dhaka";

const timeFmt = new Intl.DateTimeFormat("bn-BD", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const dateFmt = new Intl.DateTimeFormat("bn-BD", { timeZone: TZ, day: "numeric", month: "short" });
const fullFmt = new Intl.DateTimeFormat("bn-BD", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

/** Today: time. Other days: date. Always Asia/Dhaka. */
export function formatListTime(date: Date, now = new Date()): string {
  return dayKey.format(date) === dayKey.format(now) ? timeFmt.format(date) : dateFmt.format(date);
}

export function formatFull(date: Date): string {
  return fullFmt.format(date);
}

export function formatClock(date: Date): string {
  return timeFmt.format(date);
}

/** Day label for thread separators, e.g. "আজ" or "৮ মার্চ". */
export function formatDayLabel(date: Date, now = new Date()): string {
  return dayKey.format(date) === dayKey.format(now) ? "আজ" : dateFmt.format(date);
}

export function sameDay(a: Date, b: Date): boolean {
  return dayKey.format(a) === dayKey.format(b);
}
