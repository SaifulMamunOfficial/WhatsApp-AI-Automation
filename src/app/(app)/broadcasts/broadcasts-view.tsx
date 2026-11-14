"use client";

import { AlertTriangle, CheckCircle2, ChevronRight, Megaphone, Search, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Card, EmptyState, StatCard, cn, fieldClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export type BroadcastStatus = "draft" | "sending" | "paused" | "completed" | "cancelled";

export interface BroadcastRow {
  id: string;
  name: string;
  channel: string;
  template: string;
  status: BroadcastStatus;
  statusLabel: string;
  total: number;
  sent: number;
  failed: number;
  created: string;
}

const TONE: Record<BroadcastStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  sending: "info",
  paused: "warning",
  completed: "success",
  cancelled: "danger",
};

export function BroadcastsView({ rows, statusLabels }: { rows: BroadcastRow[]; statusLabels: Record<BroadcastStatus, string> }) {
  const { t, num } = useI18n();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | BroadcastStatus>("");

  const sentTotal = rows.reduce((s, r) => s + r.sent, 0);
  const failedTotal = rows.reduce((s, r) => s + r.failed, 0);
  const sendingNow = rows.filter((r) => r.status === "sending").length;
  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (!q || r.name.toLowerCase().includes(q) || r.template.toLowerCase().includes(q) || r.channel.toLowerCase().includes(q)) && (!status || r.status === status));

  return (
    <div className="space-y-6">
      <section aria-label={t("মূল সংখ্যা")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Megaphone className="size-5" />} label={t("মোট broadcast")} value={num(rows.length)} />
        <StatCard icon={<Send className="size-5" />} label={t("এখন পাঠানো হচ্ছে")} value={num(sendingNow)} tone={sendingNow > 0 ? "warning" : undefined} />
        <StatCard icon={<CheckCircle2 className="size-5" />} label={t("মোট পাঠানো মেসেজ")} value={num(sentTotal)} tone="success" />
        <StatCard icon={<AlertTriangle className="size-5" />} label={t("মোট ব্যর্থ")} value={num(failedTotal)} tone={failedTotal > 0 ? "danger" : undefined} />
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:p-4">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("নাম, টেমপ্লেট বা চ্যানেল খুঁজুন")} placeholder={t("নাম, টেমপ্লেট বা চ্যানেল খুঁজুন")} className={cn(fieldClass, "!min-h-10 pl-10")} />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t("অবস্থা")} className={cn(fieldClass, "!min-h-10 !w-auto")}>
            <option value="">{t("সব অবস্থা")}</option>
            {(Object.keys(statusLabels) as BroadcastStatus[]).map((s) => (
              <option key={s} value={s}>{statusLabels[s]}</option>
            ))}
          </select>
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={<Megaphone aria-hidden className="size-8" />} title={rows.length === 0 ? t("কোনো broadcast নেই।") : t("কিছু মেলেনি।")} hint={rows.length === 0 ? t("ওপরের ‘নতুন broadcast’ দিয়ে প্রথমটা বানান।") : undefined} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="bg-surface-2/60 text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">{t("নাম")}</th>
                  <th scope="col" className="px-4 py-3">{t("চ্যানেল")}</th>
                  <th scope="col" className="px-4 py-3">{t("টেমপ্লেট")}</th>
                  <th scope="col" className="px-4 py-3">{t("অবস্থা")}</th>
                  <th scope="col" className="px-4 py-3">{t("অগ্রগতি")}</th>
                  <th scope="col" className="px-4 py-3">{t("তৈরি")}</th>
                  <th scope="col" className="w-10 px-2 py-3"><span className="sr-only">{t("খুলুন")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((r) => {
                  const pct = r.total > 0 ? Math.round((r.sent / r.total) * 100) : 0;
                  return (
                    <tr key={r.id} className="group transition-colors hover:bg-surface-2/40">
                      <td className="px-4 py-3 font-semibold">
                        <Link href={`/broadcasts/${r.id}`} className="hover:text-brand hover:underline">{r.name}</Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{r.channel}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">{r.template}</td>
                      <td className="px-4 py-3"><Badge tone={TONE[r.status]}>{r.statusLabel}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("অগ্রগতি")}>
                            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="whitespace-nowrap text-xs text-muted">{t("পাঠানো {sent}/{total}", { sent: num(r.sent), total: num(r.total) })}</span>
                        </div>
                        {r.failed > 0 && <p className="mt-0.5 text-xs text-danger">{t("ব্যর্থ {n}", { n: num(r.failed) })}</p>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{r.created}</td>
                      <td className="px-2 py-3">
                        <Link href={`/broadcasts/${r.id}`} aria-label={t("খুলুন") + ": " + r.name} className="inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg">
                          <ChevronRight aria-hidden className="size-[18px]" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted">{t("{n}টির মধ্যে {m}টি দেখানো হচ্ছে", { n: num(rows.length), m: num(shown.length) })}</div>
      </Card>
    </div>
  );
}
