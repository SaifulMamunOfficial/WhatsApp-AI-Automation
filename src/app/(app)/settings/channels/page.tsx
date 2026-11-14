import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { retrySyncAction } from "@/core/channels/actions";
import { isRealChannelConnectAllowed } from "@/core/channels/config";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { channels, whatsappSyncState } from "@/db/schema";
import { formatFull } from "@/lib/format";
import { ConnectMessenger } from "./connect-messenger";
import { ConnectWhatsApp } from "./connect-whatsapp";
import { buttonClass } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Channels — Saimum CRM" };

export default function ChannelsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
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
  const { t, num, intl } = await getT();

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
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h1 className="text-2xl font-bold tracking-tight">{t("চ্যানেল")}</h1>
        {rows.length === 0 && <p className="text-sm text-muted">{t("কোনো চ্যানেল নেই।")}</p>}
        <ul className="space-y-3">
          {rows.map(({ channel: c, sync: s }) => (
            <li key={c.id} className="rounded-xl border border-border bg-surface-2/50 p-3.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{c.type === "whatsapp" ? "WhatsApp" : "Messenger"}</span>
                {c.isTest && <span className="rounded bg-warning-soft px-1.5 py-0.5 text-xs text-warning">{t("টেস্ট")}</span>}
                <span className="text-muted">{c.status === "active" ? t("সক্রিয়") : c.status === "pending" ? t("অপেক্ষায়") : t("বিচ্ছিন্ন")}</span>
                <span className="text-muted">{c.botEnabled ? t("bot চালু") : t("bot বন্ধ")}</span>
              </div>
              {c.displayPhone && <div className="mt-1 text-muted">{c.displayPhone}</div>}

              {s && (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted">
                  <dt>{t("সংযোগ:")}</dt>
                  <dd>{formatFull(s.onboardedAt, intl)}</dd>
                  <dt>{t("কন্টাক্ট সিঙ্ক:")}</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    {s.contactsRequestedAt ? t("চাওয়া হয়েছে · {n}টি এসেছে", { n: num(s.contactsSyncedCount) }) : t("চাওয়া হয়নি")}
                    {!s.contactsRequestedAt && <RetryButton channelId={c.id} type="smb_app_state_sync" />}
                  </dd>
                  <dt>{t("Chat history:")}</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    {t(HISTORY_LABEL[s.historyStatus])}
                    {s.historyStatus !== "not_requested" && s.historyStatus !== "declined" && " · " + num(s.historyProgress) + "% · " + t("{n}টি মেসেজ", { n: num(s.historyMessageCount) })}
                    {!s.historyRequestedAt && <RetryButton channelId={c.id} type="history" />}
                  </dd>
                </dl>
              )}
              {s?.lastError && <p className="mt-2 rounded bg-danger-soft px-2 py-1 text-fg">{t(s.lastError)}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h2 className="text-base font-bold">{t("নতুন WhatsApp নম্বর (Coexistence)")}</h2>
        <p className="text-sm text-muted">
          {t("প্রতিষ্ঠানের বিদ্যমান WhatsApp Business App নম্বর, নম্বর বা অ্যাপ না বদলে। কন্টাক্ট ও গ্রুপ অক্ষত থাকে।")}
        </p>
        {!allowed ? (
          <p className="rounded bg-warning-soft px-3 py-2 text-sm text-fg">
            {t("আসল নম্বর সংযুক্ত করা এখন বন্ধ (উন্নয়নের সময় শুধু Meta-র টেস্ট নম্বর)। go-live ধাপে সার্ভারের .env-এ ALLOW_REAL_CHANNEL_CONNECT=true দিলে এই বোতাম চালু হবে।")}
          </p>
        ) : !appId || !configId ? (
          <p className="rounded bg-warning-soft px-3 py-2 text-sm text-fg">
            {t("META_APP_ID ও META_ES_CONFIG_ID সেট করা নেই।")}
          </p>
        ) : (
          <ConnectWhatsApp appId={appId} configId={configId} graphVersion={graphVersion} />
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h2 className="text-base font-bold">Facebook Page (Messenger)</h2>
        <p className="text-sm text-muted">
          {t("Facebook দিয়ে লগইন করে আপনার পরিচালিত পেজ বেছে নিন। উন্নয়নের সময় শুধু টেস্ট পেজ সংযুক্ত করুন; আসল পেজ go-live ধাপে।")}
        </p>
        {!appId ? (
          <p className="rounded bg-warning-soft px-3 py-2 text-sm text-fg">
            {t("META_APP_ID সেট করা নেই।")}
          </p>
        ) : (
          <ConnectMessenger appId={appId} graphVersion={graphVersion} realAllowed={allowed} />
        )}
      </section>
    </main>
  );
}

async function RetryButton({ channelId, type }: { channelId: string; type: "smb_app_state_sync" | "history" }) {
  const { t: tr } = await getT();
  return (
    <form action={retrySyncAction}>
      <input type="hidden" name="channelId" value={channelId} />
      <input type="hidden" name="syncType" value={type} />
      <button type="submit" className={buttonClass("secondary", "sm")}>
        {tr("আবার চেষ্টা (২৪ ঘণ্টার মধ্যে)")}
      </button>
    </form>
  );
}
