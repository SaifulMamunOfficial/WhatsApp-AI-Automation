import Link from "next/link";
import { Bot, MessageSquare, Search, UserRound } from "lucide-react";
import { Avatar, Badge, ChannelBadge, EmptyState, cn } from "@/components/ui";
import type { ConversationRow } from "@/core/inbox/queries";
import { formatListTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { InboxFilters } from "./inbox-filters";
import { inboxHref } from "./inbox-href";
import type { InboxParams } from "./page";

export { ChannelBadge };

export { inboxHref };

export async function ConversationList({
  conversations,
  params,
  selectedId,
}: {
  conversations: ConversationRow[];
  params: InboxParams;
  selectedId?: string;
}) {
  const { t, num, intl } = await getT();

  return (
    <>
      <div className="space-y-3 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">{t("ইনবক্স")}</h1>
          <span className="text-sm text-muted">{t("{n}টি", { n: num(conversations.length) })}</span>
        </div>

        <form action="/inbox" role="search" className="relative">
          {params.channel && <input type="hidden" name="channel" value={params.channel} />}
          {params.assigned !== "all" && <input type="hidden" name="assigned" value={params.assigned} />}
          {params.status !== "open" && <input type="hidden" name="status" value={params.status} />}
          {params.needs && <input type="hidden" name="needs" value={params.needs} />}
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            maxLength={100}
            aria-label={t("কথোপকথন খুঁজুন")}
            placeholder={t("নাম, নম্বর বা মেসেজ")}
            className="block min-h-11 w-full rounded-xl border border-border-strong bg-surface pl-10 pr-3 text-[15px] transition-colors placeholder:text-muted/70 hover:border-muted focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
          />
        </form>

        <InboxFilters params={params} />
      </div>

      <ul className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
        {conversations.length === 0 && (
          <li>
            <EmptyState icon={<MessageSquare aria-hidden className="size-8" />} title={t("কোনো কথোপকথন নেই")} hint={t("ফিল্টার বদলে দেখুন, বা নতুন মেসেজ এলে এখানে দেখা যাবে।")} />
          </li>
        )}
        {conversations.map((c) => {
          const name = c.contactName ?? c.identityDisplayName ?? c.identityExternalId;
          const selected = c.id === selectedId;
          const unread = c.unreadCount > 0;
          return (
            <li key={c.id}>
              <Link
                href={inboxHref(params, { c: c.id })}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "flex gap-3 rounded-xl px-3 py-3 transition-colors duration-200",
                  selected ? "bg-brand-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand)_25%,transparent)]" : "hover:bg-surface-2",
                )}
              >
                <Avatar name={name} channel={c.channelType} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>{name}</span>
                    <time className={cn("shrink-0 text-xs", unread ? "font-medium text-brand" : "text-muted")}>{formatListTime(c.lastMessageAt, new Date(), intl)}</time>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", unread ? "text-fg" : "text-muted")}>{c.lastMessagePreview ?? "—"}</span>
                    {unread && (
                      <span className="min-w-5 shrink-0 rounded-full bg-brand px-1.5 text-center text-xs font-semibold text-brand-fg" aria-label={t("{n}টি অপঠিত", { n: num(c.unreadCount) })}>
                        {num(c.unreadCount)}
                      </span>
                    )}
                  </div>
                  {(c.needsHuman || c.assigneeName || c.botPaused) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {c.needsHuman && (
                        <Badge tone="danger">
                          <UserRound aria-hidden className="size-3" />
                          {t("মানুষ দরকার")}
                        </Badge>
                      )}
                      {c.assigneeName && <Badge>→ {c.assigneeName}</Badge>}
                      {c.botPaused && !c.needsHuman && (
                        <Badge tone="warning">
                          <Bot aria-hidden className="size-3" />
                          {t("bot বন্ধ")}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
