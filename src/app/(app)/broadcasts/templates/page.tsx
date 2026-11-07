import Link from "next/link";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { templateBodyText } from "@/channels/whatsapp/templates";
import { requireRole } from "@/core/auth/dal";
import { syncTemplatesAction } from "@/core/broadcast/actions";
import { db } from "@/db";
import { channels, templates } from "@/db/schema";
import { TemplateForm } from "./template-form";

export const metadata = { title: "টেমপ্লেট — Saimum CRM" };

export default function TemplatesPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">লোড হচ্ছে…</p>}>
      <Content />
    </Suspense>
  );
}

const STATUS = { draft: "খসড়া", pending: "Meta-র পর্যালোচনায়", approved: "অনুমোদিত", rejected: "প্রত্যাখ্যাত/বন্ধ", paused: "থামানো (মান কম)" } as const;
const btn = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";

async function Content() {
  await requireRole("admin");
  const wa = await db.select().from(channels).where(eq(channels.type, "whatsapp")).orderBy(asc(channels.createdAt));
  const all = await db.select().from(templates).orderBy(asc(templates.name));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <Link href="/broadcasts" className="text-sm underline">← Broadcast</Link>
      <h1 className="text-lg font-semibold">WhatsApp টেমপ্লেট</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        ২৪ ঘণ্টার বাইরে বা broadcast-এ শুধু Meta-র অনুমোদিত টেমপ্লেট পাঠানো যায়। অনুমোদনের অবস্থা webhook-এ নিজে হালনাগাদ হয়; সন্দেহ হলে ‘Meta থেকে sync’ চাপুন।
      </p>

      {wa.length === 0 && <p className="text-sm text-zinc-500">কোনো WhatsApp চ্যানেল নেই।</p>}
      {wa.map((c) => (
        <section key={c.id} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{c.name}{c.isTest ? " (টেস্ট)" : ""}</h2>
            <form action={syncTemplatesAction}>
              <input type="hidden" name="channelId" value={c.id} />
              <button type="submit" className={btn} disabled={!c.wabaId}>Meta থেকে sync</button>
            </form>
          </div>
          {!c.wabaId && <p className="text-sm text-amber-700">এই চ্যানেলে WhatsApp অ্যাকাউন্ট (WABA) নেই, তাই টেমপ্লেট আনা বা জমা দেওয়া যাবে না।</p>}
          <ul className="space-y-2">
            {all.filter((t) => t.channelId === c.id).map((t) => (
              <li key={t.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{t.name} <span className="font-normal text-zinc-500">({t.language} · {t.category})</span></span>
                  <span className={t.status === "approved" ? "text-emerald-700" : "text-zinc-500"}>{STATUS[t.status]}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{templateBodyText(t.components) || "—"}</p>
              </li>
            ))}
            {all.filter((t) => t.channelId === c.id).length === 0 && <li className="text-sm text-zinc-500">কোনো টেমপ্লেট নেই।</li>}
          </ul>
        </section>
      ))}

      {wa.some((c) => c.wabaId) && (
        <section className="space-y-2">
          <h2 className="font-semibold">নতুন টেমপ্লেট জমা দিন</h2>
          <TemplateForm channels={wa.filter((c) => c.wabaId).map((c) => ({ id: c.id, name: c.name }))} />
        </section>
      )}
    </main>
  );
}
