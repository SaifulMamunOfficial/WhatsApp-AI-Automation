import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight, X } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/core/auth/dal";
import { addTagAction, mergeContactsAction, removeTagAction, saveContactAction } from "@/core/contacts/actions";
import { getContactDetail, listTagsWithCounts, searchContactsForMerge } from "@/core/contacts/queries";
import { db } from "@/db";
import { formatFull } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { Chip } from "../page";
import { setOptInAction } from "@/core/broadcast/actions";
import { Alert, Avatar, Badge, Card, ChannelBadge, buttonClass, cn, fieldClass } from "@/components/ui";

export const metadata = { title: "Contact — Saimum CRM" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function ContactPage(props: Props) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content {...props} />
    </Suspense>
  );
}

const field = fieldClass;
const btn = buttonClass("secondary", "sm");

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("space-y-3 p-4 sm:p-5", className)}>
      <h2 className="text-base font-bold">{title}</h2>
      {children}
    </Card>
  );
}

async function Content({ params, searchParams }: Props) {
  const user = await requireUser();
  const { t: tr, intl } = await getT();
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
  const title = contact.name ?? identities[0]?.externalId ?? tr("নামহীন");
  const isAdmin = user.role === "admin";

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <header className="space-y-3">
        <Link href="/contacts" className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-brand">
          {tr("← সব কন্টাক্ট")}
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={title} channel={identities[0]?.channelType} size="lg" />
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              {[...new Set(identities.map((i) => i.channelType))].map((ty) => (
                <ChannelBadge key={ty} type={ty} />
              ))}
              <span>{tr("যুক্ত হয়েছে {time}", { time: formatFull(contact.createdAt, intl) })}</span>
            </div>
          </div>
          <Badge tone={contact.optedIn ? "success" : "neutral"}>{contact.optedIn ? tr("✅ সম্মতি আছে") : tr("❌ সম্মতি নেই (broadcast পাবে না)")}</Badge>
        </div>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_26rem]">
        <div className="min-w-0 space-y-6">
          <Section title={tr("তথ্য")}>
            <form action={saveContactAction} className="space-y-3">
              <input type="hidden" name="id" value={contact.id} />
              <input name="name" defaultValue={contact.name ?? ""} maxLength={200} aria-label={tr("নাম")} placeholder={tr("নাম")} className={field} />
              <textarea name="notes" defaultValue={contact.notes ?? ""} rows={4} maxLength={5000} aria-label={tr("নোট (শুধু কর্মীরা দেখেন)")} placeholder={tr("নোট (শুধু কর্মীরা দেখেন)")} className={field} />
              <button type="submit" className={buttonClass("primary", "md")}>{tr("সংরক্ষণ")}</button>
            </form>
          </Section>

          <Section title={tr("কথোপকথন")}>
            {conversations.length === 0 ? (
              <p className="text-sm text-muted">{tr("এখনো কোনো মেসেজ নেই।")}</p>
            ) : (
              <ul className="-mx-2 divide-y divide-border">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link href={`/inbox?c=${c.id}&status=all`} className="group flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-2">
                      <ChannelBadge type={c.channelType} />
                      <span className="min-w-0 flex-1 truncate text-sm text-muted">
                        {c.preview ?? ""} {c.status === "closed" ? tr("(বন্ধ)") : ""}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{formatFull(c.lastMessageAt, intl)}</span>
                      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {isAdmin && (
            <Card className="space-y-3 border-danger/40 p-4 sm:p-5">
              <h2 className="text-base font-bold">{tr("অন্য কন্টাক্ট এর সাথে মেলান (merge)")}</h2>
              <Alert tone="warning">
                {tr("একই মানুষ WhatsApp ও Facebook-এ আলাদা কন্টাক্ট হলে এখানে এক করুন। বেছে নেওয়া কন্টাক্টের সব পরিচিতি, কথোপকথন ও ট্যাগ এই কন্টাক্টে চলে আসবে এবং ওটা মুছে যাবে। এটা ফেরানো যায় না।")}
              </Alert>
              <form action={`/contacts/${contact.id}`} className="flex flex-wrap gap-2">
                <input name="mq" defaultValue={mq ?? ""} maxLength={100} aria-label={tr("যাকে মেলাবেন তার নাম বা নম্বর")} placeholder={tr("যাকে মেলাবেন তার নাম বা নম্বর")} className={cn(field, "min-w-48 flex-1")} />
                <button type="submit" className={buttonClass("secondary", "md")}>{tr("খুঁজুন")}</button>
              </form>
              {mq && candidates.length === 0 && <p className="text-sm text-muted">{tr("কাউকে পাওয়া যায়নি।")}</p>}
              {candidates.map((c) => (
                <form key={c.id} action={mergeContactsAction} className="space-y-2 rounded-xl border border-border p-3 text-sm">
                  <input type="hidden" name="keepId" value={contact.id} />
                  <input type="hidden" name="mergeId" value={c.id} />
                  <div>
                    <strong>{c.name ?? tr("নামহীন")}</strong> — {c.identities.map((i) => `${i.channelType === "whatsapp" ? "WA" : "FB"}: ${i.externalId}`).join(", ")}
                  </div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="confirm" required /> {tr("বুঝেছি, এটা ফেরানো যাবে না")}
                  </label>
                  <button type="submit" className={cn(btn, "border-danger/40 text-danger")}>{tr("এই কন্টাক্ট এই কন্টাক্টে মেলান")}</button>
                </form>
              ))}
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Section title={tr("মেসেজ পাওয়ার সম্মতি (broadcast)")}>
            <p className="text-sm">
              {contact.optedIn ? tr("✅ সম্মতি আছে") : tr("❌ সম্মতি নেই (broadcast পাবে না)")}
              {contact.optInSource && (
                <span className="text-muted"> · {tr("সূত্র:")} {tr(contact.optInSource)}{contact.optedInAt && contact.optedIn ? `, ${formatFull(contact.optedInAt, intl)}` : ""}</span>
              )}
            </p>
            {isAdmin && (
              <form action={setOptInAction}>
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="optedIn" value={String(!contact.optedIn)} />
                <button type="submit" className={btn}>{contact.optedIn ? tr("সম্মতি তুলে নিন") : tr("সম্মতি আছে বলে চিহ্নিত করুন")}</button>
              </form>
            )}
          </Section>

          <Section title={tr("ট্যাগ")}>
            <ul className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <li key={t.id} className="flex items-center">
                  <Chip name={t.name} color={t.color} />
                  <form action={removeTagAction}>
                    <input type="hidden" name="contactId" value={contact.id} />
                    <input type="hidden" name="tagId" value={t.id} />
                    <button type="submit" title={tr("সরান")} aria-label={tr("সরান")} className="inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-soft hover:text-danger">
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </form>
                </li>
              ))}
              {tags.length === 0 && <li className="text-sm text-muted">{tr("কোনো ট্যাগ নেই।")}</li>}
            </ul>
            {unused.length > 0 && (
              <form action={addTagAction} className="flex gap-2 border-t border-border pt-3">
                <input type="hidden" name="contactId" value={contact.id} />
                <select name="tagId" aria-label={tr("ট্যাগ")} className={field}>
                  {unused.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button type="submit" className={cn(buttonClass("secondary", "md"), "shrink-0")}>{tr("যোগ করুন")}</button>
              </form>
            )}
          </Section>

          <Section title={tr("পরিচিতি (চ্যানেল)")}>
            <ul className="space-y-3 text-sm">
              {identities.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <ChannelBadge type={i.channelType} />
                  <span className="text-muted">{i.channelName}</span>
                  <span className="w-full font-mono sm:w-auto">{i.externalId}</span>
                  {i.displayName && <span className="text-muted">({i.displayName})</span>}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}
