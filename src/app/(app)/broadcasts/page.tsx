import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { broadcasts, channels, templates } from "@/db/schema";
import { formatFull } from "@/lib/format";
import { buttonClass } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Broadcasts — Saimum CRM" };

export default function BroadcastsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

export const STATUS_LABEL = { draft: "খসড়া (পাঠানো হয়নি)", sending: "পাঠানো হচ্ছে", paused: "থামানো", completed: "শেষ", cancelled: "বাতিল" } as const;
const btn = buttonClass("secondary", "sm");

async function Content() {
  await requireRole("admin");
  const { t, num, intl } = await getT();
  const rows = await db
    .select({ b: broadcasts, channel: channels.name, template: templates.name })
    .from(broadcasts)
    .innerJoin(channels, eq(channels.id, broadcasts.channelId))
    .innerJoin(templates, eq(templates.id, broadcasts.templateId))
    .orderBy(desc(broadcasts.createdAt))
    .limit(100);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Broadcast (WhatsApp template)</h1>
        <div className="flex gap-2">
          <Link href="/broadcasts/templates" className={btn}>{t("টেমপ্লেট তালিকা")}</Link>
          <Link href="/broadcasts/new" className={`${btn} bg-brand text-brand-fg hover:bg-brand-hover`}>{t("নতুন broadcast")}</Link>
        </div>
      </div>
      <p className="text-sm text-muted">{t("শুধু সম্মতি (opt-in) দেওয়া কন্টাক্টদের কাছে, শুধু Meta-র অনুমোদিত টেমপ্লেটে যায়।")}</p>
      <ul className="space-y-2">
        {rows.length === 0 && <li className="text-sm text-muted">{t("কোনো broadcast নেই।")}</li>}
        {rows.map(({ b, channel, template }) => (
          <li key={b.id}>
            <Link href={`/broadcasts/${b.id}`} className="block rounded-xl border border-border bg-surface-2/50 p-3.5 text-sm hover:bg-surface-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{b.name}</span>
                <span className="text-muted">{t(STATUS_LABEL[b.status])}</span>
              </div>
              <div className="mt-1 text-muted">
                {channel} · {template} · {t("পাঠানো {sent}/{total}", { sent: num(b.sentCount), total: num(b.totalCount) })}
                {b.failedCount > 0 && " · " + t("ব্যর্থ {n}", { n: num(b.failedCount) })} · {formatFull(b.createdAt, intl)}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
