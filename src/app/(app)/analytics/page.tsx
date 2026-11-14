import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Clock, Inbox, MessageCircleQuestion, Timer } from "lucide-react";
import type { ReactNode } from "react";
import { requireRole } from "@/core/auth/dal";
import { ANALYTICS_RANGES, getAnalytics, parseRange } from "@/core/analytics/queries";
import { db } from "@/db";
import { Alert, Avatar, Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import type { TFn } from "@/lib/i18n";

export const metadata = { title: "Analytics — Saimum CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

/** 0.4 -> "less than 1 min", 75 -> "1 h 15 min". */
function formatMinutes(min: number | null, t: TFn, num: (n: number) => string): string {
  if (min === null) return "—";
  if (min < 1) return t("১ মিনিটের কম");
  const total = Math.round(min);
  if (total < 60) return t("{m} মিনিট", { m: num(total) });
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? t("{h} ঘণ্টা", { h: num(h) }) : t("{h} ঘণ্টা {m} মিনিট", { h: num(h), m: num(m) });
}

function Kpi({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden>{icon}</span>
        <p className="min-w-0 text-sm font-semibold text-muted">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </Card>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  await connection();
  const { t, num, intl } = await getT();
  const raw = await searchParams;
  const days = parseRange(Array.isArray(raw.days) ? raw.days[0] : raw.days);
  const report = await getAnalytics(db, days);
  const a = report.analytics;

  const weekdayFmt = new Intl.DateTimeFormat(intl, { timeZone: "UTC", weekday: "short" });
  const weekdayLong = new Intl.DateTimeFormat(intl, { timeZone: "UTC", weekday: "long" });
  const dayName = (i: number, long = false) => (long ? weekdayLong : weekdayFmt).format(new Date(Date.UTC(2026, 2, 9 + i))); // 9 Mar 2026 is a Monday
  const hourLabel = (h: number) => `${num(h)}:00`;
  const maxHour = Math.max(1, ...a.byHour);
  const maxHeat = Math.max(1, ...a.heat.flat());
  const empty = a.inbound === 0 && a.humanReplies === 0;

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title={t("বিশ্লেষণ")}
        description={t("টিম কত দ্রুত উত্তর দিচ্ছে আর গ্রাহকরা কখন বেশি মেসেজ করেন। সময় {tz} অনুযায়ী।", { tz: report.office.tz })}
        actions={
          <div role="group" aria-label={t("সময়সীমা")} className="inline-flex rounded-xl bg-surface-2 p-1">
            {ANALYTICS_RANGES.map((r) => (
              <Link
                key={r}
                href={`/analytics?days=${r}`}
                aria-current={r === days ? "true" : undefined}
                className={cn("inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold transition-all duration-200", r === days ? "bg-surface text-brand shadow-card" : "text-muted hover:text-fg")}
              >
                {t("গত {n} দিন", { n: num(r) })}
              </Link>
            ))}
          </div>
        }
      />

      {report.truncated && <Alert tone="warning">{t("মেসেজ অনেক বেশি, তাই শুধু সবচেয়ে নতুন ২,০০,০০০টি ধরা হয়েছে।")}</Alert>}

      {empty ? (
        <Card>
          <EmptyState icon={<Inbox aria-hidden className="size-8" />} title={t("এই সময়ে কোনো মেসেজ নেই।")} hint={t("মেসেজ আসতে শুরু করলে এখানে হিসাব দেখা যাবে।")} />
        </Card>
      ) : (
        <>
          <section aria-label={t("মূল সংখ্যা")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={<Inbox className="size-5" />} label={t("গ্রাহকের মেসেজ")} value={num(a.inbound)} hint={t("মানুষের উত্তর {h}টি, bot-এর {b}টি", { h: num(a.humanReplies), b: num(a.botReplies) })} />
            <Kpi icon={<Timer className="size-5" />} label={t("গড় উত্তর দেওয়ার সময়")} value={formatMinutes(a.avgMinutes, t, num)} hint={a.medianMinutes === null ? undefined : t("মাঝামাঝি (median): {x}", { x: formatMinutes(a.medianMinutes, t, num) })} />
            <Kpi icon={<Clock className="size-5" />} label={t("১ ঘণ্টার মধ্যে উত্তর")} value={a.within60Share === null ? "—" : `${num(Math.round(a.within60Share * 100))}%`} hint={t("{n}টি অপেক্ষার মধ্যে", { n: num(a.answeredWaits) })} />
            <Kpi icon={<MessageCircleQuestion className="size-5" />} label={t("উত্তরের অপেক্ষায়")} value={num(a.unanswered)} hint={t("অফিস সময়ে এসেছে, মানুষ এখনো উত্তর দেয়নি")} />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="space-y-3 p-4 sm:p-5">
              <h2 className="text-lg font-bold">{t("কর্মী অনুযায়ী")}</h2>
              {a.agents.length === 0 ? (
                <p className="text-sm text-muted">{t("এই সময়ে মানুষের কোনো উত্তর নেই।")}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {a.agents.map((ag) => {
                    const name = ag.userId ? (report.names[ag.userId] ?? t("অজানা কর্মী")) : t("ফোন অ্যাপ / পেজ ইনবক্স");
                    return (
                      <li key={ag.userId ?? "phone"} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <Avatar name={name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{name}</p>
                          <p className="text-sm text-muted">{t("{r}টি উত্তর · {c}টি কথোপকথন", { r: num(ag.replies), c: num(ag.conversations) })}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{formatMinutes(ag.avgMinutes, t, num)}</p>
                          <p className="text-xs text-muted">{t("গড় সময়")}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="space-y-3 p-4 sm:p-5">
              <h2 className="text-lg font-bold">{t("ঘণ্টা অনুযায়ী মেসেজ")}</h2>
              {a.peak && (
                <p className="text-sm text-muted">
                  {t("সবচেয়ে ব্যস্ত সময়: {day}, {from}–{to} ({n}টি মেসেজ)", { day: dayName(a.peak.weekday, true), from: hourLabel(a.peak.hour), to: hourLabel((a.peak.hour + 1) % 24), n: num(a.peak.count) })}
                </p>
              )}
              <ul className="flex h-40 items-end gap-0.5" aria-label={t("ঘণ্টা অনুযায়ী মেসেজ")}>
                {a.byHour.map((n, h) => (
                  <li key={h} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${hourLabel(h)}: ${num(n)}`} aria-label={`${hourLabel(h)}: ${num(n)}`}>
                    <div className="w-full rounded-t-sm bg-brand" style={{ height: `${(n / maxHour) * 100}%`, minHeight: n ? 3 : 1, opacity: n ? 1 : 0.2 }} />
                  </li>
                ))}
              </ul>
              <div className="flex justify-between text-xs text-muted" aria-hidden>
                <span>0:00</span>
                <span>6:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>23:00</span>
              </div>
            </Card>
          </div>

          <Card className="space-y-3 p-4 sm:p-5">
            <h2 className="text-lg font-bold">{t("কোন দিন কোন সময়ে")}</h2>
            <p className="text-sm text-muted">{t("গাঢ় ঘর মানে বেশি মেসেজ। ঘরের ওপর মাউস রাখলে সংখ্যা দেখা যায়।")}</p>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[34rem] border-separate border-spacing-0.5 text-xs" aria-label={t("কোন দিন কোন সময়ে")}>
                <thead>
                  <tr>
                    <th scope="col" className="w-10" />
                    {Array.from({ length: 24 }, (_, h) => (
                      <th key={h} scope="col" className="font-normal text-muted">{h % 3 === 0 ? num(h) : ""}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.heat.map((row, d) => (
                    <tr key={d}>
                      <th scope="row" className="pr-1 text-right font-semibold text-muted">{dayName(d)}</th>
                      {row.map((n, h) => (
                        <td key={h} title={`${dayName(d)} ${hourLabel(h)}: ${num(n)}`} className="h-6 rounded-sm bg-surface-2 p-0">
                          <div className="size-full rounded-sm bg-brand" style={{ opacity: n ? Math.max(0.15, n / maxHeat) : 0 }} />
                          <span className="sr-only">{num(n)}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="max-w-prose text-sm text-muted">
            {t("উত্তর দেওয়ার সময় মাপা হয় গ্রাহকের মেসেজ থেকে মানুষের (কর্মী বা ফোন/পেজ ইনবক্স) প্রথম উত্তর পর্যন্ত। bot-এর তাৎক্ষণিক উত্তর ধরা হয় না, আর অফিস সময়ের বাইরে আসা মেসেজ বাদ, কারণ সেগুলো সকালে উত্তর পাওয়ারই কথা।")}
          </p>
        </>
      )}
    </div>
  );
}
