import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { broadcasts, channels, templates } from "@/db/schema";
import { formatFull } from "@/lib/format";

export const metadata = { title: "Broadcast — Saimum CRM" };

export default function BroadcastsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">লোড হচ্ছে…</p>}>
      <Content />
    </Suspense>
  );
}

export const STATUS_LABEL = { draft: "খসড়া (পাঠানো হয়নি)", sending: "পাঠানো হচ্ছে", paused: "থামানো", completed: "শেষ", cancelled: "বাতিল" } as const;
const btn = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";

async function Content() {
  await requireRole("admin");
  const rows = await db
    .select({ b: broadcasts, channel: channels.name, template: templates.name })
    .from(broadcasts)
    .innerJoin(channels, eq(channels.id, broadcasts.channelId))
    .innerJoin(templates, eq(templates.id, broadcasts.templateId))
    .orderBy(desc(broadcasts.createdAt))
    .limit(100);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Broadcast (WhatsApp template)</h1>
        <div className="flex gap-2">
          <Link href="/broadcasts/templates" className={btn}>টেমপ্লেট</Link>
          <Link href="/broadcasts/new" className={`${btn} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`}>নতুন broadcast</Link>
        </div>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">শুধু সম্মতি (opt-in) দেওয়া কন্টাক্টদের কাছে, শুধু Meta-র অনুমোদিত টেমপ্লেটে যায়।</p>
      <ul className="space-y-2">
        {rows.length === 0 && <li className="text-sm text-zinc-500">কোনো broadcast নেই।</li>}
        {rows.map(({ b, channel, template }) => (
          <li key={b.id}>
            <Link href={`/broadcasts/${b.id}`} className="block rounded-lg border border-zinc-200 p-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{b.name}</span>
                <span className="text-zinc-500">{STATUS_LABEL[b.status]}</span>
              </div>
              <div className="mt-1 text-zinc-500">
                {channel} · {template} · পাঠানো {b.sentCount}/{b.totalCount}
                {b.failedCount > 0 && ` · ব্যর্থ ${b.failedCount}`} · {formatFull(b.createdAt)}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
