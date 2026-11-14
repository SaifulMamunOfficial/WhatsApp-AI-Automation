const TZ = "Asia/Dhaka";

// All dates are shown in Asia/Dhaka. `intl` is the Intl locale of the chosen UI language
// ("en-GB" or "bn-BD", from getT()/useI18n()); it defaults to English.
const DEFAULT_INTL = "en-GB";

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(intl: string, kind: "time" | "date" | "full"): Intl.DateTimeFormat {
  const key = `${intl}|${kind}`;
  let f = cache.get(key);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions =
      kind === "time"
        ? { hour: "numeric", minute: "2-digit", hour12: true }
        : kind === "date"
          ? { day: "numeric", month: "short" }
          : { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true };
    f = new Intl.DateTimeFormat(intl, { timeZone: TZ, ...opts });
    cache.set(key, f);
  }
  return f;
}
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });

/** Today: time. Other days: date. Always Asia/Dhaka. */
export function formatListTime(date: Date, now = new Date(), intl = DEFAULT_INTL): string {
  return dayKey.format(date) === dayKey.format(now) ? fmt(intl, "time").format(date) : fmt(intl, "date").format(date);
}

export function formatFull(date: Date, intl = DEFAULT_INTL): string {
  return fmt(intl, "full").format(date);
}

export function formatClock(date: Date, intl = DEFAULT_INTL): string {
  return fmt(intl, "time").format(date);
}

/** Day label for thread separators: `today` (already translated) or e.g. "8 Mar". */
export function formatDayLabel(date: Date, now = new Date(), intl = DEFAULT_INTL, today = "Today"): string {
  return dayKey.format(date) === dayKey.format(now) ? today : fmt(intl, "date").format(date);
}

export function sameDay(a: Date, b: Date): boolean {
  return dayKey.format(a) === dayKey.format(b);
}
