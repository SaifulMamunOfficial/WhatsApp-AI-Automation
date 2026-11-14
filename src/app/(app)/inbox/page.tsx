import { Suspense } from "react";
import { MessageSquare } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/core/auth/dal";
import { getT } from "@/lib/i18n/server";
import { getConversation, listAssignableUsers, listConversations, type InboxFilters } from "@/core/inbox/queries";
import { db } from "@/db";
import { ConversationList } from "./conversation-list";
import { ConversationView } from "./conversation-view";
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
  const { t } = await getT();
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const params = paramsSchema.parse({
    c: first(raw.c),
    channel: first(raw.channel),
    assigned: first(raw.assigned),
    status: first(raw.status),
    q: first(raw.q),
    needs: first(raw.needs),
  });

  const filters: InboxFilters = { channelType: params.channel, assigned: params.assigned, status: params.status, q: params.q, needsHuman: params.needs === "1" };
  const [conversations, detail, users] = await Promise.all([
    listConversations(db, filters, user.id),
    params.c ? getConversation(db, params.c) : Promise.resolve(null),
    listAssignableUsers(db),
  ]);

  return (
    <div className="flex h-full min-h-0">
      <Realtime />
      <aside className={`${detail ? "hidden md:flex" : "flex"} w-full min-h-0 flex-col border-border bg-surface md:w-80 md:border-r lg:w-[22rem]`}>
        <ConversationList conversations={conversations} params={params} selectedId={detail?.conversation.id} />
      </aside>
      <section className={`${detail ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col items-stretch justify-center bg-bg`}>
        {detail ? (
          <>
            {detail.conversation.unreadCount > 0 && <MarkRead conversationId={detail.conversation.id} />}
            <ConversationView detail={detail} users={users} viewer={user} params={params} />
          </>
        ) : (
          <EmptyState icon={<MessageSquare aria-hidden className="size-10" />} title={params.c ? t("কথোপকথন পাওয়া যায়নি") : t("একটি কথোপকথন বেছে নিন")} hint={params.c ? undefined : t("বাঁ দিকের তালিকা থেকে বেছে নিলে মেসেজ ও উত্তরের জায়গা এখানে খুলবে।")} />
        )}
      </section>
    </div>
  );
}
