import Link from "next/link";
import { Bot, Clock, MessageSquare, Search, UserRound } from "lucide-react";
import { Avatar, ChannelBadge, EmptyState, cn } from "@/components/ui";
import { STAGE_COLOR_MAP } from "@/components/stage-pill";
import { formatSlaBadgeLabel } from "@/core/inbox/sla";
import type { ConversationRow } from "@/core/inbox/queries";
import type { LifecycleStage } from "@/core/contacts/stages";
import { formatListTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { FiltersSheet } from "./filters-sheet";
import { InboxFilters } from "./inbox-filters";
import { inboxHref } from "./inbox-href";
import type { InboxParams } from "./page";

export { ChannelBadge };

export { inboxHref };

export async function ConversationList({
  conversations,
  params,
  selectedId,
  stages = [],
  unrepliedCount = 0,
}: {
  conversations: ConversationRow[];
  params: InboxParams;
  selectedId?: string;
  stages?: LifecycleStage[];
  unrepliedCount?: number;
}) {
  const { t, num, intl, locale } = await getT();

  return (
    <>
      <div className="space-y-3 border-b border-border p-3">
        <div className="hidden items-center justify-between md:flex">
          <h1 className="text-xl font-bold tracking-tight">{t("ইনবক্স")}</h1>
          <span className="text-sm text-muted">{t("{n}টি", { n: num(conversations.length) })}</span>
        </div>

        <div className="flex items-center gap-2">
        <form action="/inbox" role="search" className="relative min-w-0 flex-1">
          {params.channel && <input type="hidden" name="channel" value={params.channel} />}
          {params.assigned !== "all" && <input type="hidden" name="assigned" value={params.assigned} />}
          {params.status !== "open" && <input type="hidden" name="status" value={params.status} />}
          {params.needs && <input type="hidden" name="needs" value={params.needs} />}
          {params.unreplied && <input type="hidden" name="unreplied" value={params.unreplied} />}
          {params.stage && <input type="hidden" name="stage" value={params.stage} />}
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
        <div className="md:hidden">
          <FiltersSheet params={params} stages={stages} unrepliedCount={unrepliedCount} />
        </div>
        </div>

        <div className="hidden md:block">
          <InboxFilters params={params} stages={stages} unrepliedCount={unrepliedCount} />
        </div>
      </div>

      <ul className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {conversations.length === 0 && (
          <li>
            <EmptyState icon={<MessageSquare aria-hidden className="size-8" />} title={t("কোনো কথোপকথন নেই")} hint={t("ফিল্টার বদলে দেখুন, বা নতুন মেসেজ এলে এখানে দেখা যাবে।")} />
          </li>
        )}
        {conversations.map((c) => {
          const name = c.contactName ?? c.identityDisplayName ?? c.identityExternalId;
          const selected = c.id === selectedId;
          const unread = c.unreadCount > 0;
          const stageColor = c.stageName ? (STAGE_COLOR_MAP[c.stageColorKey ?? "slate"] ?? STAGE_COLOR_MAP.slate) : null;
          return (
            <li key={c.id}>
              <Link
                href={inboxHref(params, { c: c.id })}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "group relative flex gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                  "before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-brand before:transition-opacity before:content-['']",
                  selected
                    ? "bg-brand-soft/70 shadow-card before:opacity-100"
                    : "before:opacity-0 hover:bg-surface-2/80",
                )}
              >
                <Avatar name={name} channel={c.channelType} size="md" />
                <div className="min-w-0 flex-1 leading-[1.35]">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("truncate text-[15px] tracking-tight", unread ? "font-bold text-fg" : "font-semibold text-fg")}>{name}</span>
                    <time className={cn("shrink-0 text-xs tabular-nums", unread ? "font-semibold text-brand" : "text-muted")}>{formatListTime(c.lastMessageAt, new Date(), intl)}</time>
                  </div>
                  <div className="mt-px flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", unread ? "font-medium text-fg" : "text-muted")}>{c.lastMessagePreview ?? "—"}</span>
                    {unread && (
                      <span
                        className="min-w-5 shrink-0 rounded-full px-1.5 text-center text-[11px] font-bold leading-5 text-brand-fg shadow-card [background-image:var(--brand-grad)]"
                        aria-label={t("{n}টি অপঠিত", { n: num(c.unreadCount) })}
                      >
                        {num(c.unreadCount)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-muted">
                      <span className={c.assigneeName ? "text-fg/80" : undefined}>{c.assigneeName ? t("দায়িত্বে") + ": " + c.assigneeName : t("অনির্ধারিত")}</span>
                      <span className="font-medium"> · {c.channelName}</span>
                    </span>
                    {c.stageName && stageColor && (
                      <span className={cn("inline-flex h-5 max-w-32 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold shadow-card", stageColor.solid)}>
                        <span className="truncate">{c.stageName}</span>
                      </span>
                    )}
                  </div>
                  {/* Things that need attention get their own line, only when there is one. */}
                  {(c.sla || c.needsHuman || (c.botPaused && !c.needsHuman)) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {c.sla && (
                        <span
                          className={cn(
                            "inline-flex h-5 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold",
                            c.sla.color === "red" ? "bg-danger-soft text-danger" : c.sla.color === "yellow" ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
                          )}
                        >
                          <Clock aria-hidden className="size-3" />
                          {formatSlaBadgeLabel(c.sla.waitMinutes, locale)}
                        </span>
                      )}
                      {c.needsHuman && (
                        <span className="inline-flex h-5 items-center gap-1 rounded-md bg-danger-soft px-1.5 text-[11px] font-semibold text-danger">
                          <UserRound aria-hidden className="size-3" />
                          {t("মানুষ দরকার")}
                        </span>
                      )}
                      {c.botPaused && !c.needsHuman && (
                        <span className="inline-flex h-5 items-center gap-1 rounded-md bg-warning-soft px-1.5 text-[11px] font-semibold text-warning">
                          <Bot aria-hidden className="size-3" />
                          {t("bot বন্ধ")}
                        </span>
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
