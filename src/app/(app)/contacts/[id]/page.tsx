import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { requireUser } from "@/core/auth/dal";
import { addTagAction, mergeContactsAction, removeTagAction, saveContactAction } from "@/core/contacts/actions";
import { getContactDetail, listTagsWithCounts, searchContactsForMerge } from "@/core/contacts/queries";
import { db } from "@/db";
import { formatFull } from "@/lib/format";
import { Chip } from "../page";
import { setOptInAction } from "@/core/broadcast/actions";

export const metadata = { title: "কন্টাক্ট — Saimum CRM" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function ContactPage(props: Props) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">লোড হচ্ছে…</p>}>
      <Content {...props} />
    </Suspense>
  );
}

const field = "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const btn = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";

async function Content({ params, searchParams }: Props) {
  const user = await requireUser();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const detail = await getContactDetail(db, id.data);
  if (!detail) notFound();
  const { contact, identities, tags, conversations } = detail;

  const sp = await searchParams;
  const mq = (Array.isArray(sp.mq) ? sp.mq[0] : sp.mq)?.trim().slice(0, 100);
  const [allTags, candidates] = await Promise.all([
    listTagsWithCounts(db),
    user.role === "admin" && mq ? searchContactsForMerge(db, mq, contact.id) : Promise.resolve([]),
  ]);
  const unused = allTags.filter((t) => !tags.some((x) => x.id === t.id));
  const title = contact.name ?? identities[0]?.externalId ?? "নামহীন";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-4">
      <div>
        <Link href="/contacts" className="text-sm underline">← সব কন্টাক্ট</Link>
        <h1 className="mt-1 text-lg font-semibold">{title}</h1>
        <p className="text-xs text-zinc-500">যুক্ত হয়েছে {formatFull(contact.createdAt)}</p>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">তথ্য</h2>
        <form action={saveContactAction} className="space-y-2">
          <input type="hidden" name="id" value={contact.id} />
          <input name="name" defaultValue={contact.name ?? ""} maxLength={200} placeholder="নাম" className={field} />
          <textarea name="notes" defaultValue={contact.notes ?? ""} rows={3} maxLength={5000} placeholder="নোট (শুধু কর্মীরা দেখেন)" className={field} />
          <button type="submit" className={btn}>সংরক্ষণ</button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">মেসেজ পাওয়ার সম্মতি (broadcast)</h2>
        <p className="text-sm">
          {contact.optedIn ? "✅ সম্মতি আছে" : "❌ সম্মতি নেই (broadcast পাবে না)"}
          {contact.optInSource && <span className="text-zinc-500"> · সূত্র: {contact.optInSource}{contact.optedInAt && contact.optedIn ? `, ${formatFull(contact.optedInAt)}` : ""}</span>}
        </p>
        {user.role === "admin" && (
          <form action={setOptInAction}>
            <input type="hidden" name="contactId" value={contact.id} />
            <input type="hidden" name="optedIn" value={String(!contact.optedIn)} />
            <button type="submit" className={btn}>{contact.optedIn ? "সম্মতি তুলে নিন" : "সম্মতি আছে বলে চিহ্নিত করুন"}</button>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">ট্যাগ</h2>
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center gap-1">
              <Chip name={t.name} color={t.color} />
              <form action={removeTagAction}>
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="tagId" value={t.id} />
                <button type="submit" title="সরান" className="text-xs text-red-700">✕</button>
              </form>
            </li>
          ))}
          {tags.length === 0 && <li className="text-sm text-zinc-500">কোনো ট্যাগ নেই।</li>}
        </ul>
        {unused.length > 0 && (
          <form action={addTagAction} className="flex gap-2">
            <input type="hidden" name="contactId" value={contact.id} />
            <select name="tagId" className={field}>
              {unused.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button type="submit" className={`${btn} shrink-0`}>যোগ করুন</button>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">পরিচিতি (চ্যানেল)</h2>
        <ul className="space-y-1 text-sm">
          {identities.map((i) => (
            <li key={i.id}>
              {i.channelType === "whatsapp" ? "WhatsApp" : "Messenger"} · {i.channelName} — <span className="font-mono">{i.externalId}</span>
              {i.displayName && <span className="text-zinc-500"> ({i.displayName})</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">কথোপকথন</h2>
        <ul className="space-y-1 text-sm">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link href={`/inbox?c=${c.id}&status=all`} className="underline">
                {c.channelType === "whatsapp" ? "WhatsApp" : "Messenger"} · {formatFull(c.lastMessageAt)}
              </Link>
              <span className="text-zinc-500"> — {c.preview ?? ""} {c.status === "closed" ? "(বন্ধ)" : ""}</span>
            </li>
          ))}
          {conversations.length === 0 && <li className="text-zinc-500">এখনো কোনো মেসেজ নেই।</li>}
        </ul>
      </section>

      {user.role === "admin" && (
        <section className="space-y-3 rounded-lg border border-red-200 p-3 dark:border-red-900">
          <h2 className="font-semibold">অন্য কন্টাক্ট এর সাথে মেলান (merge)</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            একই মানুষ WhatsApp ও Facebook-এ আলাদা কন্টাক্ট হলে এখানে এক করুন। বেছে নেওয়া কন্টাক্টের সব পরিচিতি, কথোপকথন ও ট্যাগ <strong>এই</strong> কন্টাক্টে চলে আসবে এবং ওটা মুছে যাবে। এটা ফেরানো যায় না।
          </p>
          <form action={`/contacts/${contact.id}`} className="flex gap-2">
            <input name="mq" defaultValue={mq ?? ""} maxLength={100} placeholder="যাকে মেলাবেন তার নাম বা নম্বর" className={field} />
            <button type="submit" className={`${btn} shrink-0`}>খুঁজুন</button>
          </form>
          {mq && candidates.length === 0 && <p className="text-sm text-zinc-500">কাউকে পাওয়া যায়নি।</p>}
          {candidates.map((c) => (
            <form key={c.id} action={mergeContactsAction} className="space-y-2 rounded border border-zinc-200 p-2 text-sm dark:border-zinc-800">
              <input type="hidden" name="keepId" value={contact.id} />
              <input type="hidden" name="mergeId" value={c.id} />
              <div>
                <strong>{c.name ?? "নামহীন"}</strong> — {c.identities.map((i) => `${i.channelType === "whatsapp" ? "WA" : "FB"}: ${i.externalId}`).join(", ")}
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="confirm" required /> বুঝেছি, এটা ফেরানো যাবে না
              </label>
              <button type="submit" className={`${btn} border-red-400 text-red-800`}>এই কন্টাক্ট এই কন্টাক্টে মেলান</button>
            </form>
          ))}
        </section>
      )}
    </main>
  );
}
