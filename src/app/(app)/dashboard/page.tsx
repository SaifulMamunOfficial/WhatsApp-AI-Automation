import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, Bot, Inbox, MailOpen, MessageCircle, Users } from "lucide-react";
import type { ReactNode } from "react";
import { requireUser } from "@/core/auth/dal";
import { STATUS_LABEL } from "../broadcasts/page";
import { getDashboardStats, type DayPoint } from "@/core/dashboard/queries";
import { db } from "@/db";
import { Alert, Badge, Card, ChannelBadge, PageHeader, cn } from "@/components/ui";
import { formatListTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import type { TFn } from "@/lib/i18n";
import { connection } from "next/server";

export const metadata = { title: "Dashboard — Saimum CRM" };


export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

function Kpi({ href, icon, label, value, hint, tone = "neutral", num }: { href?: string; icon: ReactNode; label: string; value: number; hint?: string; tone?: "neutral" | "danger"; num: (n: number) => string }) {
  const body = (
    <Card className={cn("h-full p-4 transition-shadow", href && "hover:shadow-pop", tone === "danger" && value > 0 && "border-danger/40")}>
      <div className="flex items-center gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone === "danger" && value > 0 ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand")} aria-hidden>
          {icon}
        </span>
        <p className="min-w-0 text-sm font-semibold text-muted">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">{num(value)}</p>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}

function WeekChart({ days, t, num, intl }: { days: DayPoint[]; t: TFn; num: (n: number) => string; intl: string }) {
  const weekday = new Intl.DateTimeFormat(intl, { timeZone: "Asia/Dhaka", weekday: "short" });
  const max = Math.max(1, ...days.flatMap((d) => [d.inbound, d.human + d.bot]));
  const label = (d: DayPoint) => weekday.format(new Date(`${d.date}T12:00:00+06:00`));
  return (
    <div>
      <div className="flex items-center gap-4 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-brand" aria-hidden />{t("গ্রাহকের মেসেজ")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm bg-border-strong" aria-hidden />{t("আমাদের উত্তর")}</span>
      </div>
      <ul className="mt-4 grid grid-cols-7 gap-2 sm:gap-3">
        {days.map((d) => {
          const replies = d.human + d.bot;
          return (
            <li key={d.date} className="flex min-w-0 flex-col items-center gap-2" aria-label={t("{day}: গ্রাহকের মেসেজ {in}, উত্তর {out}", { day: label(d), in: num(d.inbound), out: num(replies) })}>
              <div className="flex h-36 w-full items-end justify-center gap-1" aria-hidden>
                <div className="w-1/2 max-w-6 rounded-t-md bg-brand" style={{ height: `${(d.inbound / max) * 100}%`, minHeight: d.inbound ? 4 : 2, opacity: d.inbound ? 1 : 0.25 }} />
                <div className="w-1/2 max-w-6 rounded-t-md bg-border-strong" style={{ height: `${(replies / max) * 100}%`, minHeight: replies ? 4 : 2, opacity: replies ? 1 : 0.5 }} />
              </div>
              <div className="text-center text-xs leading-tight text-muted" aria-hidden>
                <p className="font-bold text-brand">{num(d.inbound)}</p>
                <p className="font-bold">{num(replies)}</p>
                <p>{label(d)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

async function Content() {
  const user = await requireUser();
  const { t, num, intl } = await getT();
  await connection();
  const now = new Date();
  const s = await getDashboardStats(db, now);
  const isAdmin = user.role === "admin";
  const weekIn = s.days.reduce((a, d) => a + d.inbound, 0);
  const noChannel = s.channels.length === 0;

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title={t("স্বাগতম, {name}", { name: user.name })} description={t("আজকের কাজের সারসংক্ষেপ")} actions={<Link href="/inbox" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-semibold text-brand-fg shadow-card [background-image:var(--brand-grad)]"><Inbox aria-hidden className="size-4" />{t("ইনবক্সে যান")}</Link>} />

      {s.needsHuman > 0 && (
        <Alert tone="danger">
          <span className="flex flex-wrap items-center gap-2">
            {t("{n}টি কথোপকথনে মানুষের উত্তর দরকার।", { n: num(s.needsHuman) })}
            <Link href="/inbox?needs=1" className="font-bold underline">{t("দেখুন")}</Link>
          </span>
        </Alert>
      )}
      {noChannel && (
        <Alert tone="info">
          {t("এখনো কোনো চ্যানেল যুক্ত নেই।")} {isAdmin ? <Link href="/settings/channels" className="font-bold underline">{t("চ্যানেল যুক্ত করুন")}</Link> : t("অ্যাডমিনকে চ্যানেল যুক্ত করতে বলুন।")}
        </Alert>
      )}

      <section aria-label={t("মূল সংখ্যা")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi href="/inbox?status=open" icon={<MessageCircle className="size-5" />} num={num} label={t("খোলা কথোপকথন")} value={s.open} hint={t("{n}টি কারো নামে নয়", { n: num(s.unassigned) })} />
        <Kpi href="/inbox" icon={<MailOpen className="size-5" />} num={num} label={t("অপঠিত")} value={s.unread} hint={t("উত্তরের অপেক্ষায়")} />
        <Kpi href="/inbox?needs=1" icon={<AlertTriangle className="size-5" />} num={num} label={t("মানুষ দরকার")} value={s.needsHuman} tone="danger" hint={t("bot পারেনি")} />
        <Kpi icon={<Inbox className="size-5" />} num={num} label={t("আজকের মেসেজ")} value={s.todayInbound} hint={t("{n}টি উত্তর গেছে", { n: num(s.todayReplies) })} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 sm:p-5 lg:col-span-2">
          <h2 className="text-lg font-bold">{t("গত ৭ দিন")}</h2>
          <p className="mb-4 text-sm text-muted">
            {t("মোট {n}টি মেসেজ এসেছে", { n: num(weekIn) })}{s.botShare !== null && <>{t("; উত্তরের {p}% bot দিয়েছে", { p: num(Math.round(s.botShare * 100)) })}</>}{t("।")}
          </p>
          <WeekChart days={s.days} t={t} num={num} intl={intl} />
        </Card>

        <Card className="space-y-4 p-4 sm:p-5">
          <h2 className="text-lg font-bold">{t("কন্টাক্ট")}</h2>
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand" aria-hidden><Users className="size-5" /></span>
            <div>
              <p className="text-2xl font-bold leading-none">{num(s.contactsTotal)}</p>
              <p className="text-sm text-muted">{t("গত ৭ দিনে নতুন {n}", { n: num(s.contactsNew7) })}</p>
            </div>
          </div>
          <p className="text-sm text-muted">{t("Broadcast-এ সম্মতিপ্রাপ্ত:")} <b className="text-fg">{num(s.optedIn)}</b></p>
          <Link href="/contacts" className="inline-block min-h-11 py-2.5 text-sm font-bold text-brand hover:underline">{t("সব কন্টাক্ট →")}</Link>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 text-lg font-bold">{t("চ্যানেল")}</h2>
          {s.channels.length === 0 ? (
            <p className="text-sm text-muted">{t("কোনো চ্যানেল নেই।")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {s.channels.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
                  <ChannelBadge type={c.type} />
                  <span className="min-w-0 basis-full truncate font-semibold sm:basis-0 sm:flex-1">{c.name}</span>
                  {c.isTest && <Badge>{t("টেস্ট")}</Badge>}
                  <Badge tone={c.status === "active" ? "success" : "warning"}>{c.status === "active" ? t("সচল") : c.status === "pending" ? t("অপেক্ষায়") : t("বিচ্ছিন্ন")}</Badge>
                  <span className="inline-flex items-center gap-1 text-sm text-muted"><Bot aria-hidden className="size-4" />{c.botEnabled ? t("bot চালু") : t("bot বন্ধ")}</span>
                  <span className="text-sm text-muted">{t("খোলা {n}", { n: num(c.open) })}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {isAdmin && (
          <Card className="p-4 sm:p-5">
            <h2 className="mb-3 text-lg font-bold">{t("সর্বশেষ Broadcast")}</h2>
            {s.lastBroadcast ? (
              <div className="space-y-2">
                <Link href={`/broadcasts/${s.lastBroadcast.id}`} className="block min-h-11 font-semibold text-brand hover:underline">{s.lastBroadcast.name}</Link>
                <p className="text-sm text-muted">
                  {t("{sent}/{total}টি পাঠানো, ব্যর্থ {failed}", { sent: num(s.lastBroadcast.sent), total: num(s.lastBroadcast.total), failed: num(s.lastBroadcast.failed) })} · {t("অবস্থা:")} {t(STATUS_LABEL[s.lastBroadcast.status as keyof typeof STATUS_LABEL] ?? s.lastBroadcast.status)} · {formatListTime(s.lastBroadcast.createdAt, now, intl)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">{t("এখনো কোনো broadcast হয়নি।")}</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
