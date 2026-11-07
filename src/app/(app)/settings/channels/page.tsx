import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { retrySyncAction } from "@/core/channels/actions";
import { isRealChannelConnectAllowed } from "@/core/channels/config";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { channels, whatsappSyncState } from "@/db/schema";
import { formatFull } from "@/lib/format";
import { ConnectWhatsApp } from "./connect-whatsapp";

export const metadata = { title: "চ্যানেল — Saimum CRM" };

export default function ChannelsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">লোড হচ্ছে…</p>}>
      <ChannelsContent />
    </Suspense>
  );
}

const HISTORY_LABEL = {
  not_requested: "চাওয়া হয়নি",
  requested: "চাওয়া হয়েছে, অপেক্ষায়",
  in_progress: "চলছে",
  complete: "সম্পূর্ণ",
  declined: "শেয়ার করা হয়নি (ব্যবসা অনুমতি দেয়নি)",
  failed: "ব্যর্থ",
} as const;

async function ChannelsContent() {
  await requireRole("admin");

  const rows = await db
    .select({ channel: channels, sync: whatsappSyncState })
    .from(channels)
    .leftJoin(whatsappSyncState, eq(whatsappSyncState.channelId, channels.id))
    .orderBy(asc(channels.createdAt));

  const allowed = isRealChannelConnectAllowed();
  const appId = process.env.META_APP_ID;
  const configId = process.env.META_ES_CONFIG_ID;
  const graphVersion = process.env.META_GRAPH_VERSION ?? "v23.0";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-4">
      <section className="space-y-3">
        <h1 className="text-lg font-semibold">চ্যানেল</h1>
        {rows.length === 0 && <p className="text-sm text-zinc-500">কোনো চ্যানেল নেই।</p>}
        <ul className="space-y-3">
          {rows.map(({ channel: c, sync: s }) => (
            <li key={c.id} className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] dark:bg-zinc-800">{c.type === "whatsapp" ? "WhatsApp" : "Messenger"}</span>
                {c.isTest && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900">টেস্ট</span>}
                <span className="text-zinc-500">{c.status === "active" ? "সক্রিয়" : c.status === "pending" ? "অপেক্ষায়" : "বিচ্ছিন্ন"}</span>
                <span className="text-zinc-500">{c.botEnabled ? "bot চালু" : "bot বন্ধ"}</span>
              </div>
              {c.displayPhone && <div className="mt-1 text-zinc-500">{c.displayPhone}</div>}

              {s && (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-zinc-600 dark:text-zinc-400">
                  <dt>সংযোগ:</dt>
                  <dd>{formatFull(s.onboardedAt)}</dd>
                  <dt>কন্টাক্ট সিঙ্ক:</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    {s.contactsRequestedAt ? `চাওয়া হয়েছে · ${s.contactsSyncedCount}টি এসেছে` : "চাওয়া হয়নি"}
                    {!s.contactsRequestedAt && <RetryButton channelId={c.id} type="smb_app_state_sync" />}
                  </dd>
                  <dt>Chat history:</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    {HISTORY_LABEL[s.historyStatus]}
                    {s.historyStatus !== "not_requested" && s.historyStatus !== "declined" && ` · ${s.historyProgress}% · ${s.historyMessageCount}টি মেসেজ`}
                    {!s.historyRequestedAt && <RetryButton channelId={c.id} type="history" />}
                  </dd>
                </dl>
              )}
              {s?.lastError && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-red-900 dark:bg-red-900/20 dark:text-red-200">{s.lastError}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">নতুন WhatsApp নম্বর (Coexistence)</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          প্রতিষ্ঠানের বিদ্যমান WhatsApp Business App নম্বর, নম্বর বা অ্যাপ না বদলে। কন্টাক্ট ও গ্রুপ অক্ষত থাকে।
        </p>
        {!allowed ? (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            আসল নম্বর সংযুক্ত করা এখন <strong>বন্ধ</strong> (উন্নয়নের সময় শুধু Meta-র টেস্ট নম্বর)। go-live ধাপে সার্ভারের{" "}
            <code>.env</code>-এ <code>ALLOW_REAL_CHANNEL_CONNECT=true</code> দিলে এই বোতাম চালু হবে।
          </p>
        ) : !appId || !configId ? (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            <code>META_APP_ID</code> ও <code>META_ES_CONFIG_ID</code> সেট করা নেই।
          </p>
        ) : (
          <ConnectWhatsApp appId={appId} configId={configId} graphVersion={graphVersion} />
        )}
      </section>
    </main>
  );
}

function RetryButton({ channelId, type }: { channelId: string; type: "smb_app_state_sync" | "history" }) {
  return (
    <form action={retrySyncAction}>
      <input type="hidden" name="channelId" value={channelId} />
      <input type="hidden" name="syncType" value={type} />
      <button type="submit" className="rounded border border-zinc-300 px-2 py-0.5 text-xs dark:border-zinc-700">
        আবার চেষ্টা (২৪ ঘণ্টার মধ্যে)
      </button>
    </form>
  );
}
