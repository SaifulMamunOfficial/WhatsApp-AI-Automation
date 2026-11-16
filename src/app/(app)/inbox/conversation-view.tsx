import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, CheckCheck, CircleCheck, Clock, FileText, Loader2, RotateCcw, StickyNote } from "lucide-react";
import { Alert, Avatar, Badge, buttonClass, ChannelBadge, cn } from "@/components/ui";
import { StageSelector } from "./stage-selector";
import { TransferDialog } from "./transfer-dialog";
import type { LifecycleStage } from "@/core/contacts/stages";
import { statusAction } from "@/core/inbox/actions";
import type { ConversationDetail } from "@/core/inbox/queries";
import { replyWindow } from "@/core/inbox/window";
import { retryMediaAction } from "@/core/media/actions";
import { kindOf } from "@/core/media/types";
import { formatClock, formatDayLabel, formatFull, sameDay } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import type { TFn } from "@/lib/i18n";
import type { QuickReply } from "@/core/inbox/quick-reply-match";
import { NoteForm, ReplyForm, ScrollToBottom } from "./client-bits";
import { NewOrderButton } from "./new-order-button";
import { AssignSelect, HeaderDetails } from "./header-controls";
import type { OrderStatus } from "@/core/orders/rules";
import { TagsButton, type TagView } from "./tag-bar";
import { HeaderMenu } from "./header-menu";
import { TemplatePanel, type TemplateOption } from "./template-panel";
import { inboxHref } from "./conversation-list";
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
  template: "টেমপ্লেট",
  media_placeholder: "মিডিয়া",
  unsupported: "অসমর্থিত মেসেজ",
};

function senderLabel(m: Message, t: TFn): string | null {
  if (m.direction === "inbound") return null;
  if (m.sentByBot) return t("বট");
  if (m.sentByUserName) return m.sentByUserName;
  if (m.source === "phone_app") return t("ফোন অ্যাপ থেকে");
  if (m.source === "page_inbox") return t("পেজ ইনবক্স থেকে");
  return null;
}

const STATUS: Record<Message["status"], { label: string; icon: typeof Check }> = {
  pending: { label: "পাঠানো হচ্ছে", icon: Clock },
  sent: { label: "পাঠানো হয়েছে", icon: Check },
  delivered: { label: "পৌঁছেছে", icon: CheckCheck },
  read: { label: "দেখা হয়েছে", icon: CheckCheck },
  failed: { label: "ব্যর্থ", icon: AlertCircle },
};

/** The attached file: the picture / player / download link, a "loading" note, or a retry button. */
function Attachment({ m, t, num }: { m: Message; t: TFn; num: (n: number) => string }) {
  if (!m.mediaId) return null;
  const src = `/api/media/${m.mediaId}`;
  if (m.mediaStatus === "ready") {
    const group = kindOf(m.mediaMime)?.group;
    if (group === "image")
      return (
        <a href={src} target="_blank" rel="noreferrer" className="mb-1 block">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-protected file, not optimizable by next/image */}
          <img src={src} alt={m.body || t("ছবি")} loading="lazy" className="max-h-72 max-w-full rounded-lg object-contain" />
        </a>
      );
    if (group === "audio") return <audio controls preload="none" src={src} className="mb-1 h-10 w-full max-w-64" />;
    if (group === "video") return <video controls preload="metadata" src={src} className="mb-1 max-h-72 max-w-full rounded-lg" />;
    const kb = m.mediaSize ? Math.max(1, Math.round(m.mediaSize / 1024)) : null;
    return (
      <a href={src} download className="mb-1 flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-sm font-medium hover:bg-black/15">
        <FileText aria-hidden className="size-5 shrink-0" />
        <span className="min-w-0 truncate">{m.mediaName ?? t("ফাইল")}</span>
        {kb && <span className="shrink-0 text-xs opacity-70">{num(kb)} KB</span>}
      </a>
    );
  }
  if (m.mediaStatus === "failed")
    return (
      <form action={retryMediaAction} className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <input type="hidden" name="id" value={m.mediaId} />
        <span>{t(m.mediaError ?? "ফাইল নামানো যায়নি")}</span>
        <button type="submit" className="rounded-md border border-current px-2 py-0.5 font-semibold">{t("আবার চেষ্টা")}</button>
      </form>
    );
  return (
    <p className="mb-1 inline-flex items-center gap-1.5 text-xs opacity-80">
      <Loader2 aria-hidden className="size-3.5 animate-spin" />
      {t("ফাইল আসছে…")}
    </p>
  );
}

function Bubble({ m, t, intl, num }: { m: Message; t: TFn; intl: string; num: (n: number) => string }) {
  const out = m.direction === "outbound";
  const label = senderLabel(m, t);
  // The type chip only when there is no file to show (history, unsupported, or a type we do not fetch).
  const media = m.type !== "text" && !m.mediaId ? t(TYPE_LABEL[m.type] ?? m.type) : null;
  const status = { ...STATUS[m.status], label: t(STATUS[m.status].label) };
  const StatusIcon = status.icon;

  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-4 py-2.5 text-[15px] shadow-card sm:max-w-[70%]",
          out ? "rounded-2xl rounded-br-md bg-bubble-out text-bubble-out-fg" : "rounded-2xl rounded-bl-md border border-border bg-surface",
          m.status === "failed" && "ring-2 ring-danger",
        )}
      >
        {label && <div className={cn("mb-0.5 text-xs font-medium", out ? "text-bubble-out-muted" : "text-muted")}>{label}</div>}
        {media && <div className="mb-1 inline-flex rounded bg-black/10 px-1.5 py-0.5 text-xs">{media}</div>}
        <Attachment m={m} t={t} num={num} />
        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        <div className={cn("mt-1 flex items-center justify-end gap-1.5 text-xs", out ? "text-bubble-out-muted" : "text-muted")}>
          {out && (
            <span className="inline-flex items-center gap-1" title={status.label}>
              <StatusIcon aria-hidden className={cn("size-3.5", m.status === "read" && "text-tick-read")} />
              <span className="sr-only">{status.label}</span>
            </span>
          )}
          <time title={formatFull(m.sentAt, intl)}>{formatClock(m.sentAt, intl)}</time>
        </div>
        {m.status === "failed" && m.error && <div className="mt-1 text-xs font-medium">⚠ {t(m.error)}</div>}
      </div>
    </div>
  );
}

const WINDOW_TEXT = {
  no_customer_message: "এই গ্রাহক এখনো কোনো মেসেজ পাঠাননি, তাই উত্তর দেওয়া যাবে না।",
  template_required: "২৪ ঘণ্টা পার হয়ে গেছে। WhatsApp-এ এখন শুধু অনুমোদিত template পাঠানো যায়; নিচ থেকে একটা বেছে নিন।",
  expired: "উত্তর দেওয়ার সময় (Messenger-এ সর্বোচ্চ ৭ দিন) শেষ।",
} as const;

export async function ConversationView({
  detail,
  users,
  viewer,
  params,
  quickReplies,
  allTags,
  templatePanel,
  stages = [],
  aiAvailable = true,
  aiDisabledReason,
  orders = [],
}: {
  templatePanel?: { templates: TemplateOption[]; optedIn: boolean };
  quickReplies: QuickReply[];
  allTags: TagView[];
  detail: ConversationDetail;
  users: { id: string; name: string; role: "admin" | "agent" }[];
  viewer: { id: string; role: "admin" | "agent" };
  params: InboxParams;
  stages?: LifecycleStage[];
  aiAvailable?: boolean;
  aiDisabledReason?: "no_provider" | "no_knowledge";
  orders?: { id: string; label: string; status: OrderStatus; title: string }[];
}) {
  const { t, num, intl } = await getT();
  const { conversation: c, messages, notes, contactTags } = detail;
  const name = c.contactName ?? c.identityDisplayName ?? c.identityExternalId;
  const win = replyWindow(c.channelType, c.lastCustomerMessageAt, { sender: "human" });
  const closed = c.status === "closed";

  // Agents may only pick themselves; admins may pick anyone.
  const assignable = viewer.role === "admin" ? users : users.filter((u) => u.id === viewer.id);

  return (
    <>
      <header className="@container flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-border bg-surface px-3 py-3 sm:px-5">
        {/* Who this is */}
        <Link href={inboxHref(params, { c: null })} aria-label={t("তালিকায় ফিরুন")} className="order-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 md:hidden">
          <ArrowLeft aria-hidden className="size-5" />
        </Link>
        <div className="order-1 flex min-w-0 flex-1 basis-56 items-center gap-3">
          <Avatar name={name} channel={c.channelType} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate text-lg font-bold tracking-tight">{name}</h2>
              <ChannelBadge type={c.channelType} />
              {closed && <Badge>{t("বন্ধ")}</Badge>}
            </div>
            <p className="truncate text-sm text-muted">
              {c.identityExternalId} · {c.channelName}
            </p>
          </div>
        </div>

        {/* The main action, and the rarely used things behind "more" */}
        <div className="order-2 flex shrink-0 items-center gap-2 @4xl:order-3">
          <form action={statusAction}>
            <input type="hidden" name="conversationId" value={c.id} />
            <input type="hidden" name="status" value={closed ? "open" : "closed"} />
            <button type="submit" className={buttonClass(closed ? "secondary" : "primary", "sm", "!h-9")}>
              {closed ? <RotateCcw aria-hidden className="size-4" /> : <CircleCheck aria-hidden className="size-4" />}
              {closed ? t("আবার খুলুন") : t("সমাধান হয়েছে")}
            </button>
          </form>
          <HeaderMenu conversationId={c.id} contactId={c.contactId} contactName={name} botPaused={c.botPaused && !c.needsHuman} orders={orders} />
        </div>

        {/* Stage, owner and quick actions: one toolbar (behind a toggle on phones) */}
        <HeaderDetails>
          {stages.length > 0 && <StageSelector contactId={c.contactId} currentStageId={c.stageId} stages={stages} />}
          <AssignSelect conversationId={c.id} current={c.assignedUserId} currentName={c.assigneeName} options={assignable.map((u) => ({ id: u.id, name: u.name }))} />
          <span aria-hidden className="mx-0.5 hidden h-5 w-px bg-border md:block" />
          <NewOrderButton contactId={c.contactId} contactLabel={name} conversationId={c.id} openCount={orders.filter((o) => o.status === "pending" || o.status === "in_progress").length} />
          <TransferDialog
            conversationId={c.id}
            currentAssigneeId={c.assignedUserId}
            currentAssigneeName={c.assigneeName}
            users={users}
            viewerId={viewer.id}
            viewerRole={viewer.role}
          />
          <TagsButton contactId={c.contactId} tags={contactTags} allTags={allTags} />
        </HeaderDetails>

        {c.needsHuman && (
          <div className="order-4 w-full">
            <Alert tone="danger">
              <strong>{t("bot উত্তর দিতে পারেনি, একজন মানুষ দরকার।")}</strong> {t("আপনি উত্তর দিলে বা কথোপকথন সমাধান করলে এই চিহ্ন সরে যাবে।")}
            </Alert>
          </div>
        )}
      </header>

      <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto bg-bg px-3 py-4 sm:px-4">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted">{t("কোনো মেসেজ নেই।")}</p>}
        {messages.map((m, i) => {
          const showDay = i === 0 || !sameDay(messages[i - 1].sentAt, m.sentAt);
          return (
            <div key={m.id} className="space-y-3">
              {showDay && (
                <div className="flex justify-center">
                  <span className="rounded-full border border-border bg-surface px-3 py-0.5 text-xs font-medium text-muted shadow-card">{formatDayLabel(m.sentAt, new Date(), intl, t("আজ"))}</span>
                </div>
              )}
              <Bubble m={m} t={t} intl={intl} num={num} />
            </div>
          );
        })}
        <ScrollToBottom trigger={`${c.id}:${messages.length}:${messages.at(-1)?.status ?? ""}`} />
      </div>

      <div className="space-y-3 border-t border-border bg-surface p-3 sm:px-4">
        {win.mode === "closed" && <Alert tone="warning">{t(WINDOW_TEXT[win.reason])}</Alert>}
        {win.mode === "closed" && win.reason === "template_required" && templatePanel && (
          <TemplatePanel conversationId={c.id} templates={templatePanel.templates} optedIn={templatePanel.optedIn} />
        )}
        {win.mode === "human_agent_only" && (
          <Alert tone="info">{t("২৪ ঘণ্টা পার হয়েছে। আপনি এখনো উত্তর দিতে পারবেন (Human Agent), শেষ সময় {time}।", { time: formatFull(win.closesAt, intl) })}</Alert>
        )}

        <ReplyForm
          conversationId={c.id}
          disabled={win.mode === "closed"}
          quickReplies={quickReplies}
          aiAvailable={aiAvailable}
          aiDisabledReason={aiDisabledReason}
        />

        <details open={notes.length > 0} className="group rounded-lg border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-muted hover:text-fg">
            <StickyNote aria-hidden className="size-4" />
            {t("অভ্যন্তরীণ নোট")}
            <Badge className="ml-1">{num(notes.length)}</Badge>
          </summary>
          <div className="space-y-3 border-t border-border p-3">
            {notes.length > 0 && (
              <ul className="scroll-thin max-h-40 space-y-2 overflow-y-auto">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
                    <p className="whitespace-pre-wrap break-words text-fg">{n.body}</p>
                    <p className="mt-1 text-xs text-muted">
                      {n.userName ?? "—"} · {formatFull(n.createdAt, intl)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <NoteForm conversationId={c.id} />
          </div>
        </details>
      </div>
    </>
  );
}
