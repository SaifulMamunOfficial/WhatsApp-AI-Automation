import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { requireUser } from "@/core/auth/dal";
import { createTagAction, deleteTagAction } from "@/core/contacts/actions";
import { CONTACTS_PAGE_SIZE, listContacts, listTagsWithCounts } from "@/core/contacts/queries";
import { db } from "@/db";
import { formatListTime } from "@/lib/format";

export const metadata = { title: "কন্টাক্ট — Saimum CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const params = z.object({
  q: z.string().max(100).optional().catch(undefined),
  tag: z.uuid().optional().catch(undefined),
  channel: z.enum(["whatsapp", "messenger"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

export default function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">লোড হচ্ছে…</p>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const field = "rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700";
const btn = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";

export function Chip({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: color ?? "#52525b" }}>
      {name}
    </span>
  );
}

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const p = params.parse({ q: first(raw.q), tag: first(raw.tag), channel: first(raw.channel), page: first(raw.page) });

  const [{ items, total, page }, tags] = await Promise.all([
    listContacts(db, { q: p.q, tagId: p.tag, channelType: p.channel, page: p.page }),
    listTagsWithCounts(db),
  ]);
  const pages = Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE));
  const href = (over: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: p.q, tag: p.tag, channel: p.channel, ...over })) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `/contacts?${qs}` : "/contacts";
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">কন্টাক্ট ({total})</h1>
        {user.role === "admin" && (
          <Link href="/contacts/import" className={btn}>
            CSV আমদানি
          </Link>
        )}
      </div>

      <form action="/contacts" className="flex flex-wrap gap-2">
        <input name="q" defaultValue={p.q ?? ""} maxLength={100} placeholder="নাম বা নম্বর খুঁজুন" className={`${field} min-w-48 flex-1`} />
        <select name="tag" defaultValue={p.tag ?? ""} className={field}>
          <option value="">সব ট্যাগ</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.count})</option>
          ))}
        </select>
        <select name="channel" defaultValue={p.channel ?? ""} className={field}>
          <option value="">সব চ্যানেল</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="messenger">Messenger</option>
        </select>
        <button type="submit" className={btn}>খুঁজুন</button>
      </form>

      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {items.length === 0 && <li className="p-4 text-sm text-zinc-500">কোনো কন্টাক্ট নেই।</li>}
        {items.map((c) => (
          <li key={c.id}>
            <Link href={`/contacts/${c.id}`} className="block space-y-1 px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{c.name ?? c.identities[0]?.externalId ?? "নামহীন"}</span>
                <span className="shrink-0 text-xs text-zinc-500">{c.lastMessageAt ? formatListTime(c.lastMessageAt) : "মেসেজ নেই"}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                {c.identities.map((i) => (
                  <span key={i.id}>{i.channelType === "whatsapp" ? "WhatsApp" : "Messenger"}: {i.externalId}</span>
                ))}
                {c.tags.map((t) => (
                  <Chip key={t.id} name={t.name} color={t.color} />
                ))}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className={btn}>← আগের</Link> : <span />}
          <span className="text-zinc-500">পাতা {page} / {pages}</span>
          {page < pages ? <Link href={href({ page: String(page + 1) })} className={btn}>পরের →</Link> : <span />}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">ট্যাগ</h2>
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center gap-1">
              <Link href={`/contacts?tag=${t.id}`}><Chip name={`${t.name} · ${t.count}`} color={t.color} /></Link>
              {user.role === "admin" && (
                <form action={deleteTagAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" title="ট্যাগ মুছুন (কন্টাক্ট মুছবে না)" className="text-xs text-red-700">✕</button>
                </form>
              )}
            </li>
          ))}
          {tags.length === 0 && <li className="text-sm text-zinc-500">কোনো ট্যাগ নেই।</li>}
        </ul>
        <form action={createTagAction} className="flex flex-wrap gap-2">
          <input name="name" required maxLength={40} placeholder="নতুন ট্যাগ (যেমন: VIP)" className={field} />
          <input name="color" type="color" defaultValue="#2563eb" className="h-9 w-12 rounded border border-zinc-300 dark:border-zinc-700" aria-label="রং" />
          <button type="submit" className={btn}>ট্যাগ বানান</button>
        </form>
      </section>
    </main>
  );
}
