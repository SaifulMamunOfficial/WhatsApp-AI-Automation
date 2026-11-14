import Link from "next/link";
import { Bot, MessageSquare, Search, UserRound } from "lucide-react";
import { Avatar, Badge, ChannelBadge, EmptyState, cn } from "@/components/ui";
import type { ConversationRow } from "@/core/inbox/queries";
import { formatListTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import type { InboxParams } from "./page";

export { ChannelBadge };

/** Builds an /inbox URL from the current params with some overrides; drops defaults. */
export function inboxHref(params: InboxParams, override: Partial<Record<keyof InboxParams, string | null>> = {}): string {
  const merged: Record<string, string | null | undefined> = { ...params, ...override };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (!v) continue;
    if (k === "assigned" && v === "all") continue;
    if (k === "status" && v === "open") continue;
    sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/inbox?${qs}` : "/inbox";
}

/** One group of mutually exclusive filter choices, drawn as a segmented control. */
function Segment({ label, options }: { label: string; options: { href: string; label: string; active: boolean }[] }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <Link
          key={o.label}
          href={o.href}
          aria-current={o.active ? "true" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold transition-all duration-200",
            o.active ? "bg-surface text-brand shadow-card" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

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
  // The open conversation is deliberately dropped from filter links so changing a filter shows the list.
  const f = (o: Partial<Record<keyof InboxParams, string | null>>) => inboxHref(params, { c: null, ...o });

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

        <div className="flex flex-wrap gap-2">
          <Segment
            label={t("চ্যানেল")}
            options={[
              { href: f({ channel: null }), label: t("সব"), active: !params.channel },
              { href: f({ channel: "whatsapp" }), label: "WhatsApp", active: params.channel === "whatsapp" },
              { href: f({ channel: "messenger" }), label: "Messenger", active: params.channel === "messenger" },
            ]}
          />
          <Segment
            label={t("দায়িত্ব")}
            options={[
              { href: f({ assigned: "all" }), label: t("সব"), active: params.assigned === "all" },
              { href: f({ assigned: "me" }), label: t("আমার"), active: params.assigned === "me" },
              { href: f({ assigned: "unassigned" }), label: t("অনির্ধারিত"), active: params.assigned === "unassigned" },
            ]}
          />
          <Segment
            label={t("অবস্থা")}
            options={[
              { href: f({ status: "open" }), label: t("খোলা"), active: params.status === "open" },
              { href: f({ status: "closed" }), label: t("বন্ধ"), active: params.status === "closed" },
            ]}
          />
          <Link
            href={f({ needs: params.needs ? null : "1" })}
            aria-pressed={!!params.needs}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
              params.needs ? "bg-danger-soft text-danger" : "bg-surface-2 text-muted hover:text-fg",
            )}
          >
            <UserRound aria-hidden className="size-4" />
            {t("মানুষ দরকার")}
          </Link>
        </div>
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
