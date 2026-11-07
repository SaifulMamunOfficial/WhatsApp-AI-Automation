import { Suspense } from "react";
import { z } from "zod";
import { requireUser } from "@/core/auth/dal";
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
});

export type InboxParams = z.infer<typeof paramsSchema>;

export default function InboxPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">লোড হচ্ছে…</p>}>
      <InboxContent searchParams={searchParams} />
    </Suspense>
  );
}

async function InboxContent({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const raw = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const params = paramsSchema.parse({
    c: first(raw.c),
    channel: first(raw.channel),
    assigned: first(raw.assigned),
    status: first(raw.status),
    q: first(raw.q),
  });

  const filters: InboxFilters = { channelType: params.channel, assigned: params.assigned, status: params.status, q: params.q };
  const [conversations, detail, users] = await Promise.all([
    listConversations(db, filters, user.id),
    params.c ? getConversation(db, params.c) : Promise.resolve(null),
    listAssignableUsers(db),
  ]);

  return (
    <div className="flex h-[calc(100dvh-3.25rem)] min-h-0">
      <Realtime />
      <aside className={`${detail ? "hidden md:flex" : "flex"} w-full min-h-0 flex-col border-zinc-200 md:w-80 md:border-r lg:w-96 dark:border-zinc-800`}>
        <ConversationList conversations={conversations} params={params} selectedId={detail?.conversation.id} />
      </aside>
      <section className={`${detail ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-1 flex-col`}>
        {detail ? (
          <>
            {detail.conversation.unreadCount > 0 && <MarkRead conversationId={detail.conversation.id} />}
            <ConversationView detail={detail} users={users} viewer={user} params={params} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-sm text-zinc-500">
            {params.c ? "কথোপকথন পাওয়া যায়নি।" : "বাঁ দিক থেকে একটি কথোপকথন বেছে নিন।"}
          </div>
        )}
      </section>
    </div>
  );
}
