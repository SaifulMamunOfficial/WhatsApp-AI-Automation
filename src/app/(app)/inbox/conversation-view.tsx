import Link from "next/link";
import { assignAction, resumeBotAction, statusAction } from "@/core/inbox/actions";
import type { ConversationDetail } from "@/core/inbox/queries";
import { replyWindow } from "@/core/inbox/window";
import { formatClock, formatDayLabel, formatFull, sameDay } from "@/lib/format";
import { NoteForm, ReplyForm, ScrollToBottom } from "./client-bits";
import { ChannelBadge, inboxHref } from "./conversation-list";
import type { InboxParams } from "./page";

type Message = ConversationDetail["messages"][number];

const TYPE_LABEL: Record<string, string> = {
  image: "ছবি",
  video: "ভিডিও",
  audio: "অডিও",
  document: "ডকুমেন্ট",
  file: "ফাইল",
  sticker: "স্টিকার",
  location: "লোকেশন",
  contacts: "কন্টাক্ট",
  postback: "বোতাম",
  unsupported: "অসমর্থিত মেসেজ",
};

function senderLabel(m: Message): string | null {
  if (m.direction === "inbound") return null;
  if (m.sentByBot) return "বট";
  if (m.sentByUserName) return m.sentByUserName;
  if (m.source === "phone_app") return "ফোন অ্যাপ থেকে";
  if (m.source === "page_inbox") return "পেজ ইনবক্স থেকে";
  return null;
}

const STATUS_LABEL: Record<Message["status"], string> = {
  pending: "পাঠানো হচ্ছে",
  sent: "পাঠানো হয়েছে",
  delivered: "পৌঁছেছে",
  read: "দেখা হয়েছে",
  failed: "ব্যর্থ",
};

function Bubble({ m }: { m: Message }) {
  const out = m.direction === "outbound";
  const label = senderLabel(m);
  const media = m.type !== "text" ? (TYPE_LABEL[m.type] ?? m.type) : null;

  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
          out ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800"
        } ${m.status === "failed" ? "ring-2 ring-red-500" : ""}`}
      >
        {label && <div className="mb-0.5 text-[11px] opacity-70">{label}</div>}
        {media && <div className="mb-0.5 text-xs italic opacity-80">[{media}]</div>}
        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        <div className="mt-1 flex items-center justify-end gap-2 text-[11px] opacity-70">
          {out && <span>{STATUS_LABEL[m.status]}</span>}
          <span title={formatFull(m.sentAt)}>{formatClock(m.sentAt)}</span>
        </div>
        {m.status === "failed" && m.error && <div className="mt-1 text-[11px] text-red-300 dark:text-red-700">{m.error}</div>}
      </div>
    </div>
  );
}

const WINDOW_TEXT = {
  no_customer_message: "এই গ্রাহক এখনো কোনো মেসেজ পাঠাননি, তাই উত্তর দেওয়া যাবে না।",
  template_required: "২৪ ঘণ্টা পার হয়ে গেছে। WhatsApp-এ এখন শুধু অনুমোদিত template পাঠানো যায় (পরের ধাপে আসছে)।",
  expired: "উত্তর দেওয়ার সময় (Messenger-এ সর্বোচ্চ ৭ দিন) শেষ।",
} as const;

export function ConversationView({
  detail,
  users,
  viewer,
  params,
}: {
  detail: ConversationDetail;
  users: { id: string; name: string; role: "admin" | "agent" }[];
  viewer: { id: string; role: "admin" | "agent" };
  params: InboxParams;
}) {
  const { conversation: c, messages, notes } = detail;
  const name = c.contactName ?? c.identityDisplayName ?? c.identityExternalId;
  const win = replyWindow(c.channelType, c.lastCustomerMessageAt, { sender: "human" });
  const closed = c.status === "closed";

  // Agents may only pick themselves; admins may pick anyone.
  const assignable = viewer.role === "admin" ? users : users.filter((u) => u.id === viewer.id);

  return (
    <>
      <header className="space-y-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Link href={inboxHref(params, { c: null })} className="text-sm underline md:hidden">
            ← তালিকা
          </Link>
          <h2 className="truncate text-base font-semibold">{name}</h2>
          <ChannelBadge type={c.channelType} />
          <span className="truncate text-xs text-zinc-500">{c.channelName}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="text-zinc-500">{c.identityExternalId}</span>

          <form action={assignAction} className="flex items-center gap-1">
            <input type="hidden" name="conversationId" value={c.id} />
            <label htmlFor="assign" className="text-zinc-500">দায়িত্বে:</label>
            {/* key: React resets the form after the action, so remount to show the new server value */}
            <select key={c.assignedUserId ?? "none"} id="assign" name="userId" defaultValue={c.assignedUserId ?? ""} className="rounded border border-zinc-300 bg-transparent px-1 py-0.5 dark:border-zinc-700">
              <option value="">— কেউ নেই —</option>
              {assignable.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
              {c.assignedUserId && !assignable.some((u) => u.id === c.assignedUserId) && (
                <option value={c.assignedUserId}>{c.assigneeName}</option>
              )}
            </select>
            <button type="submit" className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-700">সেট</button>
          </form>

          <form action={statusAction}>
            <input type="hidden" name="conversationId" value={c.id} />
            <input type="hidden" name="status" value={closed ? "open" : "closed"} />
            <button type="submit" className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-700">
              {closed ? "আবার খুলুন" : "বন্ধ করুন"}
            </button>
          </form>

          {c.needsHuman && (
            <span className="rounded bg-red-100 px-2 py-0.5 text-red-800 dark:bg-red-900/40 dark:text-red-200">🙋 bot উত্তর দিতে পারেনি, মানুষ দরকার</span>
          )}
          {c.botPaused && !c.needsHuman && (
            <form action={resumeBotAction} className="flex items-center gap-1">
              <input type="hidden" name="conversationId" value={c.id} />
              <span className="text-amber-700 dark:text-amber-400">মানুষ উত্তর দিয়েছে, bot বন্ধ</span>
              <button type="submit" className="rounded border border-zinc-300 px-2 py-0.5 dark:border-zinc-700">bot চালু করুন</button>
            </form>
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {messages.length === 0 && <p className="text-sm text-zinc-500">কোনো মেসেজ নেই।</p>}
        {messages.map((m, i) => {
          const showDay = i === 0 || !sameDay(messages[i - 1].sentAt, m.sentAt);
          return (
            <div key={m.id} className="space-y-2">
              {showDay && <div className="py-1 text-center text-xs text-zinc-500">{formatDayLabel(m.sentAt)}</div>}
              <Bubble m={m} />
            </div>
          );
        })}
        <ScrollToBottom trigger={`${c.id}:${messages.length}:${messages.at(-1)?.status ?? ""}`} />
      </div>

      <div className="space-y-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <details open={notes.length > 0} className="text-sm">
          <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">নোট ({notes.length})</summary>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {notes.map((n) => (
              <li key={n.id} className="rounded bg-amber-50 px-2 py-1 dark:bg-amber-900/20">
                <span className="whitespace-pre-wrap break-words">{n.body}</span>
                <span className="ml-2 text-[11px] text-zinc-500">{n.userName ?? "—"} · {formatFull(n.createdAt)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <NoteForm conversationId={c.id} />
          </div>
        </details>

        {win.mode === "closed" && (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">{WINDOW_TEXT[win.reason]}</p>
        )}
        {win.mode === "human_agent_only" && (
          <p className="rounded bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-900/20 dark:text-sky-200">
            ২৪ ঘণ্টা পার হয়েছে। আপনি এখনো উত্তর দিতে পারবেন (Human Agent), শেষ সময় {formatFull(win.closesAt)}।
          </p>
        )}
        <ReplyForm conversationId={c.id} disabled={win.mode === "closed"} />
      </div>
    </>
  );
}
