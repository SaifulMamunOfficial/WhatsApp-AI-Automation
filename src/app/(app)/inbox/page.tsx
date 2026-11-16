import { Suspense } from "react";
import { connection } from "next/server";
import { MessageSquare } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/core/auth/dal";
import { placeholderCount, templateBodyText } from "@/channels/whatsapp/templates";
import { listTagsWithCounts } from "@/core/contacts/queries";
import { listLifecycleStages } from "@/core/contacts/stages";
import { getInboxUnrepliedCount, getTemplatePanelData } from "@/core/inbox/queries";
import { listQuickReplies } from "@/core/inbox/quick-replies";
import { isAiDraftAvailable } from "@/core/ai/draft";
import { getT } from "@/lib/i18n/server";
import { getConversation, listAssignableUsers, listConversations, type InboxFilters } from "@/core/inbox/queries";
import { db } from "@/db";
import { ConversationList } from "./conversation-list";
import { ConversationView } from "./conversation-view";
import { listOrders } from "@/core/orders/queries";
import { formatOrderNumber } from "@/core/orders/rules";
import { MarkRead } from "./client-bits";
import { Realtime } from "./realtime";

export const metadata = { title: "Inbox — Saimum CRM" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Unknown or malformed values fall back to defaults instead of erroring.
const paramsSchema = z.object({
  c: z.uuid().optional().catch(undefined),
  channel: z.enum(["whatsapp", "messenger"]).optional().catch(undefined),
  assigned: z.enum(["all", "me", "unassigned"]).catch("all"),
  status: z.enum(["open", "closed", "all"]).catch("open"),
  q: z.string().max(100).optional().catch(undefined),
  needs: z.enum(["1"]).optional().catch(undefined),
  unreplied: z.enum(["1"]).optional().catch(undefined),
  stage: z.uuid().optional().catch(undefined),
});

export type InboxParams = z.infer<typeof paramsSchema>;

export default function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <InboxContent searchParams={searchParams} />
    </Suspense>
  );
}

async function InboxContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  await connection();
  const { t, locale } = await getT();
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const params = paramsSchema.parse({
    c: first(raw.c),
    channel: first(raw.channel),
    assigned: first(raw.assigned),
    status: first(raw.status),
    q: first(raw.q),
    needs: first(raw.needs),
    unreplied: first(raw.unreplied),
    stage: first(raw.stage),
  });

  const filters: InboxFilters = {
    channelType: params.channel,
    assigned: params.assigned,
    status: params.status,
    q: params.q,
    needsHuman: params.needs === "1",
    unreplied: params.unreplied === "1",
    stageId: params.stage,
  };

  const [conversations, detail, users, quickReplies, allTags, stages, unrepliedCount] = await Promise.all([
    listConversations(db, filters, user.id, locale),
    params.c ? getConversation(db, params.c, locale) : Promise.resolve(null),
    listAssignableUsers(db),
    listQuickReplies(db),
    listTagsWithCounts(db),
    listLifecycleStages(db),
    getInboxUnrepliedCount(db),
  ]);

  // After 24 hours a WhatsApp customer can only be written to with an approved template.
  const needsTemplate = detail?.conversation.channelType === "whatsapp";
  const [panel, aiStatus, contactOrders] = await Promise.all([
    detail && needsTemplate ? getTemplatePanelData(db, detail.conversation.channelId, detail.conversation.contactId) : Promise.resolve(null),
    detail
      ? isAiDraftAvailable(db)
      : Promise.resolve({ available: false, reason: undefined as "no_provider" | "no_knowledge" | undefined }),
    detail ? listOrders(db, { contactId: detail.conversation.contactId, status: "all" }, user.id) : Promise.resolve([]),
  ]);
  const templatePanel = panel
    ? {
        optedIn: panel.optedIn,
        templates: panel.templates.map((x) => {
          const body = templateBodyText(x.components);
          return { id: x.id, name: x.name, language: x.language, category: x.category, body, variables: placeholderCount(body) };
        }),
      }
    : undefined;

  return (
    <div className="flex h-full min-h-0">
      <Realtime />
      <aside className={`${detail ? "hidden md:flex" : "flex"} w-full min-h-0 flex-col border-border bg-surface md:w-80 md:border-r lg:w-[22rem]`}>
        <ConversationList
          conversations={conversations}
          params={params}
          selectedId={detail?.conversation.id}
          stages={stages}
          unrepliedCount={unrepliedCount}
        />
      </aside>
      <section className={`${detail ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col items-stretch justify-center bg-bg`}>
        {detail ? (
          <>
            {detail.conversation.unreadCount > 0 && <MarkRead conversationId={detail.conversation.id} />}
            <ConversationView
              detail={detail}
              users={users}
              viewer={user}
              params={params}
              quickReplies={quickReplies}
              allTags={allTags}
              templatePanel={templatePanel}
              stages={stages}
              aiAvailable={aiStatus.available}
              aiDisabledReason={aiStatus.reason}
              orders={contactOrders.map((o) => ({ id: o.id, label: formatOrderNumber(o.number), status: o.status, title: o.title }))}
            />
          </>
        ) : (
          <EmptyState
            icon={<MessageSquare aria-hidden className="size-10" />}
            title={params.c ? t("কথোপকথন পাওয়া যায়নি") : t("একটি কথোপকথন বেছে নিন")}
            hint={params.c ? undefined : t("বাঁ দিকের তালিকা থেকে বেছে নিলে মেসেজ ও উত্তরের জায়গা এখানে খুলবে।")}
          />
        )}
      </section>
    </div>
  );
}
