import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { renderTemplate, templateBodyText } from "@/channels/whatsapp/templates";
import { requireRole } from "@/core/auth/dal";
import { cancelBroadcastAction, continueBroadcastAction, pauseBroadcastAction } from "@/core/broadcast/actions";
import { db } from "@/db";
import { broadcastRecipients, broadcasts, channels, contacts, templates } from "@/db/schema";
import { formatFull } from "@/lib/format";
import { STATUS_LABEL } from "../page";
import { StartForm } from "./start-form";
import { buttonClass } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Broadcast — Saimum CRM" };

type Props = { params: Promise<{ id: string }> };

export default function BroadcastPage(props: Props) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content {...props} />
    </Suspense>
  );
}

const btn = buttonClass("secondary", "sm");

async function Content({ params }: Props) {
  await requireRole("admin");
  const { t, num, intl } = await getT();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [row] = await db
    .select({ b: broadcasts, channel: channels.name, isTest: channels.isTest, template: templates })
    .from(broadcasts)
    .innerJoin(channels, eq(channels.id, broadcasts.channelId))
    .innerJoin(templates, eq(templates.id, broadcasts.templateId))
    .where(eq(broadcasts.id, id.data))
    .limit(1);
  if (!row) notFound();
  const { b, template } = row;

  const sample = await db
    .select({ r: broadcastRecipients, name: contacts.name })
    .from(broadcastRecipients)
    .innerJoin(contacts, eq(contacts.id, broadcastRecipients.contactId))
    .where(eq(broadcastRecipients.broadcastId, b.id))
    .orderBy(sql`case ${broadcastRecipients.status} when 'failed' then 0 else 1 end`, asc(broadcastRecipients.toNumber))
    .limit(30);
  const pending = b.totalCount - b.sentCount - b.failedCount - b.skippedCount;
  const preview = renderTemplate(templateBodyText(template.components), ((b.params as { kind: string; value?: string; fallback?: string }[]) ?? []).map((p) => (p.kind === "fixed" ? (p.value ?? "") : (p.fallback ?? ""))));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Link href="/broadcasts" className="text-sm underline">← Broadcast</Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{b.name}</h1>
        <p className="text-sm text-muted">{row.channel}{row.isTest ? " (" + t("টেস্ট") + ")" : ""} · {t("টেমপ্লেট {name}", { name: template.name })} · {formatFull(b.createdAt, intl)}</p>
      </div>

      <section className="space-y-1 rounded-xl border border-border bg-surface-2/50 p-3.5 text-sm">
        <div className="font-medium">{t("অবস্থা:")} {t(STATUS_LABEL[b.status])}</div>
        {b.pauseReason && <div className="text-warning">{t("কারণ:")} {t(b.pauseReason)}</div>}
        <div>{t("মোট {total} · পাঠানো {sent} · ব্যর্থ {failed} · বাদ {skipped} · বাকি {left}", { total: num(b.totalCount), sent: num(b.sentCount), failed: num(b.failedCount), skipped: num(b.skippedCount), left: num(Math.max(0, pending)) })}</div>
        <div className="mt-2 rounded bg-surface-2 p-2 whitespace-pre-wrap">{preview}</div>
        <div className="text-xs text-muted">{t("উপরে প্রথম নামের জায়গায় বিকল্প লেখা দেখানো হয়েছে; আসলে প্রত্যেকের নাম বসবে।")}</div>
      </section>

      {(b.status === "draft" || b.status === "paused") && (
        <section className="space-y-2 rounded-lg border border-danger/40 p-3">
          <h2 className="text-base font-bold">{b.status === "draft" ? t("পাঠানো শুরু") : t("আবার চালু")}</h2>
          <p className="text-sm text-muted">
            {t("{n} জনকে WhatsApp template মেসেজ যাবে, যার খরচ আছে এবং ফেরানো যায় না। শুরুর পর যেকোনো সময় থামানো যায়।", { n: num(b.totalCount) })}
          </p>
          <StartForm id={b.id} total={b.totalCount} />
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {b.status === "sending" && (
          <>
            <form action={pauseBroadcastAction}><input type="hidden" name="id" value={b.id} /><button className={btn}>{t("থামান")}</button></form>
            <form action={continueBroadcastAction}><input type="hidden" name="id" value={b.id} /><button className={btn} title={t("সার্ভার রিস্টার্ট ইত্যাদিতে থেমে গেলে আবার চালান")}>{t("আবার চালান (আটকে গেলে)")}</button></form>
          </>
        )}
        {(b.status === "draft" || b.status === "paused" || b.status === "sending") && (
          <form action={cancelBroadcastAction}><input type="hidden" name="id" value={b.id} /><button className={`${btn} border-danger/40 text-danger`}>{t("বাতিল (বাকিরা আর পাবে না)")}</button></form>
        )}
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h2 className="text-base font-bold">{t("প্রাপক (প্রথম ৩০, ব্যর্থ আগে)")}</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card text-sm">
          {sample.map(({ r, name }) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
              <span>{name ?? t("নামহীন")} <span className="text-muted">{r.toNumber}</span></span>
              <span className={r.status === "failed" ? "text-danger" : "text-muted"}>
                {t({ pending: "বাকি", sending: "চলছে", sent: "পাঠানো", failed: "ব্যর্থ", skipped: "বাদ" }[r.status])}
                {r.error && ` — ${t(r.error)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
