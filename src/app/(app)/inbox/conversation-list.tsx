import Link from "next/link";
import type { ConversationRow } from "@/core/inbox/queries";
import { formatListTime } from "@/lib/format";
import type { InboxParams } from "./page";

const CHANNEL_LABEL = { whatsapp: "WhatsApp", messenger: "Messenger" } as const;

export function ChannelBadge({ type }: { type: "whatsapp" | "messenger" }) {
  const color = type === "whatsapp" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${color}`}>{CHANNEL_LABEL[type]}</span>;
}

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

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-2.5 py-1 text-xs ${active ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {children}
    </Link>
  );
}

export function ConversationList({
  conversations,
  params,
  selectedId,
}: {
  conversations: ConversationRow[];
  params: InboxParams;
  selectedId?: string;
}) {
  // The open conversation is deliberately dropped from filter links so changing a filter shows the list.
  const f = (o: Partial<Record<keyof InboxParams, string | null>>) => inboxHref(params, { c: null, ...o });

  return (
    <>
      <div className="space-y-2 border-b border-zinc-200 p-3 dark:border-zinc-800">
        <form action="/inbox" className="flex gap-2">
          {params.channel && <input type="hidden" name="channel" value={params.channel} />}
          {params.assigned !== "all" && <input type="hidden" name="assigned" value={params.assigned} />}
          {params.status !== "open" && <input type="hidden" name="status" value={params.status} />}
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            maxLength={100}
            placeholder="নাম, নম্বর বা মেসেজ খুঁজুন"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700"
          />
        </form>
        <div className="flex flex-wrap gap-1.5">
          <Tab href={f({ channel: null })} active={!params.channel}>সব চ্যানেল</Tab>
          <Tab href={f({ channel: "whatsapp" })} active={params.channel === "whatsapp"}>WhatsApp</Tab>
          <Tab href={f({ channel: "messenger" })} active={params.channel === "messenger"}>Messenger</Tab>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Tab href={f({ assigned: "all" })} active={params.assigned === "all"}>সব</Tab>
          <Tab href={f({ assigned: "me" })} active={params.assigned === "me"}>আমার</Tab>
          <Tab href={f({ assigned: "unassigned" })} active={params.assigned === "unassigned"}>অনির্ধারিত</Tab>
          <span className="mx-1 border-l border-zinc-300 dark:border-zinc-700" />
          <Tab href={f({ status: "open" })} active={params.status === "open"}>খোলা</Tab>
          <Tab href={f({ status: "closed" })} active={params.status === "closed"}>বন্ধ</Tab>
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 && <li className="p-4 text-sm text-zinc-500">কোনো কথোপকথন নেই।</li>}
        {conversations.map((c) => {
          const name = c.contactName ?? c.identityDisplayName ?? c.identityExternalId;
          const selected = c.id === selectedId;
          return (
            <li key={c.id}>
              <Link
                href={inboxHref(params, { c: c.id })}
                className={`block border-b border-zinc-100 px-3 py-2.5 dark:border-zinc-900 ${selected ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.unreadCount > 0 ? "font-semibold" : "font-medium"}`}>{name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{formatListTime(c.lastMessageAt)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.unreadCount > 0 ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}>
                    {c.lastMessagePreview ?? ""}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="shrink-0 rounded-full bg-red-600 px-1.5 text-xs font-medium text-white" aria-label={`${c.unreadCount}টি অপঠিত`}>
                      {c.unreadCount}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500">
                  <ChannelBadge type={c.channelType} />
                  {c.assigneeName && <span>→ {c.assigneeName}</span>}
                  {c.botPaused && <span title="মানুষ উত্তর দিয়েছে, bot বন্ধ">🙋</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
