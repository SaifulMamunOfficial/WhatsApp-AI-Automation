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

export const metadata = { title: "Broadcast — Saimum CRM" };

type Props = { params: Promise<{ id: string }> };

export default function BroadcastPage(props: Props) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">লোড হচ্ছে…</p>}>
      <Content {...props} />
    </Suspense>
  );
}

const btn = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";

async function Content({ params }: Props) {
  await requireRole("admin");
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
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4">
      <Link href="/broadcasts" className="text-sm underline">← Broadcast</Link>
      <div>
        <h1 className="text-lg font-semibold">{b.name}</h1>
        <p className="text-sm text-zinc-500">{row.channel}{row.isTest ? " (টেস্ট)" : ""} · টেমপ্লেট {template.name} · {formatFull(b.createdAt)}</p>
      </div>

      <section className="space-y-1 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
        <div className="font-medium">অবস্থা: {STATUS_LABEL[b.status]}</div>
        {b.pauseReason && <div className="text-amber-700">কারণ: {b.pauseReason}</div>}
        <div>মোট {b.totalCount} · পাঠানো {b.sentCount} · ব্যর্থ {b.failedCount} · বাদ {b.skippedCount} · বাকি {Math.max(0, pending)}</div>
        <div className="mt-2 rounded bg-zinc-50 p-2 whitespace-pre-wrap dark:bg-zinc-900">{preview}</div>
        <div className="text-xs text-zinc-500">উপরে প্রথম নামের জায়গায় বিকল্প লেখা দেখানো হয়েছে; আসলে প্রত্যেকের নাম বসবে।</div>
      </section>

      {(b.status === "draft" || b.status === "paused") && (
        <section className="space-y-2 rounded-lg border border-red-200 p-3 dark:border-red-900">
          <h2 className="font-semibold">{b.status === "draft" ? "পাঠানো শুরু" : "আবার চালু"}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {b.totalCount} জনকে WhatsApp template মেসেজ যাবে, যার খরচ আছে এবং ফেরানো যায় না। শুরুর পর যেকোনো সময় থামানো যায়।
          </p>
          <StartForm id={b.id} total={b.totalCount} />
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {b.status === "sending" && (
          <>
            <form action={pauseBroadcastAction}><input type="hidden" name="id" value={b.id} /><button className={btn}>থামান</button></form>
            <form action={continueBroadcastAction}><input type="hidden" name="id" value={b.id} /><button className={btn} title="সার্ভার রিস্টার্ট ইত্যাদিতে থেমে গেলে আবার চালান">আবার চালান (আটকে গেলে)</button></form>
          </>
        )}
        {(b.status === "draft" || b.status === "paused" || b.status === "sending") && (
          <form action={cancelBroadcastAction}><input type="hidden" name="id" value={b.id} /><button className={`${btn} border-red-400 text-red-800`}>বাতিল (বাকিরা আর পাবে না)</button></form>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">প্রাপক (প্রথম ৩০, ব্যর্থ আগে)</h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {sample.map(({ r, name }) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5">
              <span>{name ?? "নামহীন"} <span className="text-zinc-500">{r.toNumber}</span></span>
              <span className={r.status === "failed" ? "text-red-700" : "text-zinc-500"}>
                {{ pending: "বাকি", sending: "চলছে", sent: "পাঠানো", failed: "ব্যর্থ", skipped: "বাদ" }[r.status]}
                {r.error && ` — ${r.error}`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
