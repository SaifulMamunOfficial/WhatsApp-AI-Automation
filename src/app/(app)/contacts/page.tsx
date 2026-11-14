import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Search, Upload, Users, X } from "lucide-react";
import { z } from "zod";
import { requireUser } from "@/core/auth/dal";
import { createTagAction, deleteTagAction } from "@/core/contacts/actions";
import { CONTACTS_PAGE_SIZE, listContacts, listTagsWithCounts } from "@/core/contacts/queries";
import { db } from "@/db";
import { formatListTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { Avatar, Card, EmptyState, PageHeader, TagChip, buttonClass, cn, fieldClass } from "@/components/ui";

export const metadata = { title: "Contacts — Saimum CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const params = z.object({
  q: z.string().max(100).optional().catch(undefined),
  tag: z.uuid().optional().catch(undefined),
  channel: z.enum(["whatsapp", "messenger"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

export default function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const btn = buttonClass("secondary", "sm");

export { TagChip as Chip };

async function Content({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const { t: tr, num, intl } = await getT();
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
  const filtered = !!(p.q || p.tag || p.channel);
  const now = new Date();
  const channelTabs: { value: string | null; label: string }[] = [
    { value: null, label: tr("সব") },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "messenger", label: "Messenger" },
  ];

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title={tr("কন্টাক্ট")}
        description={tr("{n}টি কন্টাক্ট", { n: num(total) })}
        actions={
          user.role === "admin" && (
            <Link href="/contacts/import" className={buttonClass("secondary", "md")}>
              <Upload aria-hidden className="size-4" />
              {tr("CSV আমদানি")}
            </Link>
          )
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-4">
          <Card className="space-y-3 p-3 sm:p-4">
            <form action="/contacts" role="search" className="flex flex-wrap gap-2">
              {p.channel && <input type="hidden" name="channel" value={p.channel} />}
              <div className="relative min-w-48 flex-1">
                <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
                <input name="q" defaultValue={p.q ?? ""} maxLength={100} aria-label={tr("নাম বা নম্বর খুঁজুন")} placeholder={tr("নাম বা নম্বর খুঁজুন")} className={cn(fieldClass, "pl-10")} />
              </div>
              <select name="tag" defaultValue={p.tag ?? ""} aria-label={tr("ট্যাগ")} className={cn(fieldClass, "!w-auto")}>
                <option value="">{tr("সব ট্যাগ")}</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({num(t.count)})</option>
                ))}
              </select>
              <button type="submit" className={buttonClass("primary", "md")}>{tr("খুঁজুন")}</button>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label={tr("সব চ্যানেল")} className="inline-flex rounded-xl bg-surface-2 p-1">
                {channelTabs.map((c) => {
                  const active = (p.channel ?? null) === c.value;
                  return (
                    <Link
                      key={c.label}
                      href={href({ channel: c.value, page: null })}
                      aria-current={active ? "true" : undefined}
                      className={cn("inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold transition-all duration-200", active ? "bg-surface text-brand shadow-card" : "text-muted hover:text-fg")}
                    >
                      {c.label}
                    </Link>
                  );
                })}
              </div>
              {filtered && (
                <Link href="/contacts" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-muted hover:text-brand">
                  <X aria-hidden className="size-4" />
                  {tr("ফিল্টার মুছুন")}
                </Link>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden">
            {items.length === 0 ? (
              <EmptyState icon={<Users aria-hidden className="size-8" />} title={tr("কোনো কন্টাক্ট নেই।")} />
            ) : (
              <ul className="divide-y divide-border">
                {items.map((c) => {
                  const name = c.name ?? c.identities[0]?.externalId ?? tr("নামহীন");
                  return (
                    <li key={c.id}>
                      <Link href={`/contacts/${c.id}`} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
                        <Avatar name={name} channel={c.identities[0]?.channelType} />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="truncate font-semibold">{name}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                            {c.identities.map((i) => (
                              <span key={i.id}>{i.channelType === "whatsapp" ? "WhatsApp" : "Messenger"} · {i.externalId}</span>
                            ))}
                          </div>
                          {c.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                              {c.tags.map((t) => (
                                <TagChip key={t.id} name={t.name} color={t.color} />
                              ))}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 text-xs text-muted">{c.lastMessageAt ? formatListTime(c.lastMessageAt, now, intl) : tr("মেসেজ নেই")}</span>
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {pages > 1 && (
            <nav aria-label={tr("পাতা {page} / {pages}", { page: num(page), pages: num(pages) })} className="flex items-center justify-between gap-2 text-sm">
              {page > 1 ? (
                <Link href={href({ page: String(page - 1) })} className={btn}><ChevronLeft aria-hidden className="size-4" />{tr("← আগের")}</Link>
              ) : <span />}
              <span className="text-muted">{tr("পাতা {page} / {pages}", { page: num(page), pages: num(pages) })}</span>
              {page < pages ? (
                <Link href={href({ page: String(page + 1) })} className={btn}>{tr("পরের →")}<ChevronRight aria-hidden className="size-4" /></Link>
              ) : <span />}
            </nav>
          )}
        </div>

        <Card className="space-y-4 p-4 sm:p-5 lg:sticky lg:top-4">
          <h2 className="text-base font-bold">{tr("ট্যাগ")}</h2>
          <ul className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <li key={t.id} className="flex items-center">
                <Link href={`/contacts?tag=${t.id}`} className={cn("rounded-full", p.tag === t.id && "ring-2 ring-brand ring-offset-2 ring-offset-surface")}>
                  <TagChip name={`${t.name} · ${num(t.count)}`} color={t.color} />
                </Link>
                {user.role === "admin" && (
                  <form action={deleteTagAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" title={tr("ট্যাগ মুছুন (কন্টাক্ট মুছবে না)")} aria-label={tr("ট্যাগ মুছুন (কন্টাক্ট মুছবে না)")} className="inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-soft hover:text-danger">
                      <X aria-hidden className="size-3.5" />
                    </button>
                  </form>
                )}
              </li>
            ))}
            {tags.length === 0 && <li className="text-sm text-muted">{tr("কোনো ট্যাগ নেই।")}</li>}
          </ul>
          <form action={createTagAction} className="space-y-2 border-t border-border pt-4">
            <input name="name" required maxLength={40} aria-label={tr("নতুন ট্যাগ (যেমন: VIP)")} placeholder={tr("নতুন ট্যাগ (যেমন: VIP)")} className={fieldClass} />
            <div className="flex items-center gap-2">
              <input name="color" type="color" defaultValue="#c2410c" className="h-11 w-14 cursor-pointer rounded-xl border border-border-strong bg-surface p-1" aria-label={tr("রং")} />
              <button type="submit" className={cn(buttonClass("secondary", "md"), "flex-1")}>{tr("ট্যাগ বানান")}</button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
