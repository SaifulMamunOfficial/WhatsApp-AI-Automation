import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { Bot, MessageCircle, Plug, Radio } from "lucide-react";
import { retrySyncAction } from "@/core/channels/actions";
import { isRealChannelConnectAllowed } from "@/core/channels/config";
import { botModeOf } from "@/core/automation/bot-mode";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { channels, whatsappSyncState } from "@/db/schema";
import { formatFull } from "@/lib/format";
import { Alert, Badge, Card, ChannelBadge, EmptyState, PageHeader, PageShell, StatCard, buttonClass } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { ConnectMessenger } from "./connect-messenger";
import { ConnectWhatsApp } from "./connect-whatsapp";

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

  const stats = {
    total: rows.length,
    active: rows.filter((r) => r.channel.status === "active").length,
    whatsapp: rows.filter((r) => r.channel.type === "whatsapp").length,
    messenger: rows.filter((r) => r.channel.type === "messenger").length,
  };

  return (
    <PageShell>
      <PageHeader title={t("চ্যানেল")} description={t("WhatsApp নম্বর ও Facebook Page যেখান থেকে গ্রাহকের মেসেজ আসে, এখানে দেখুন ও যুক্ত করুন।")} />

      <section aria-label={t("মূল সংখ্যা")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Plug className="size-5" />} label={t("মোট চ্যানেল")} value={num(stats.total)} />
        <StatCard icon={<Radio className="size-5" />} label={t("সক্রিয়")} value={num(stats.active)} tone="success" />
        <StatCard icon={<MessageCircle className="size-5" />} label="WhatsApp" value={num(stats.whatsapp)} />
        <StatCard icon={<Bot className="size-5" />} label="Messenger" value={num(stats.messenger)} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t("যুক্ত চ্যানেল")}</h2>
        {rows.length === 0 ? (
          <Card>
            <EmptyState icon={<Plug aria-hidden className="size-8" />} title={t("কোনো চ্যানেল নেই।")} hint={t("নিচ থেকে একটা যুক্ত করুন।")} />
          </Card>
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {rows.map(({ channel: c, sync: s }) => {
              const mode = botModeOf(c);
              return (
                <li key={c.id}>
                  <Card className="h-full space-y-3 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <ChannelBadge type={c.type} />
                      <h3 className="min-w-0 flex-1 truncate text-base font-bold">{c.name}</h3>
                      {c.isTest && <Badge tone="warning">{t("টেস্ট")}</Badge>}
                      <Badge tone={c.status === "active" ? "success" : c.status === "pending" ? "warning" : "danger"}>
                        {c.status === "active" ? t("সক্রিয়") : c.status === "pending" ? t("অপেক্ষায়") : t("বিচ্ছিন্ন")}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                      {c.displayPhone && <span className="font-mono">{c.displayPhone}</span>}
                      <span className="inline-flex items-center gap-1">
                        <Bot aria-hidden className="size-4" />
                        {mode === "off" ? t("bot বন্ধ") : mode === "after_hours" ? t("bot: শুধু অফিস বন্ধে") : t("bot চালু")}
                      </span>
                    </div>

                    {s && (
                      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-xl bg-surface-2/60 p-3 text-sm">
                        <dt className="text-muted">{t("সংযোগ:")}</dt>
                        <dd>{formatFull(s.onboardedAt, intl)}</dd>
                        <dt className="text-muted">{t("কন্টাক্ট সিঙ্ক:")}</dt>
                        <dd className="flex flex-wrap items-center gap-2">
                          {s.contactsRequestedAt ? t("চাওয়া হয়েছে · {n}টি এসেছে", { n: num(s.contactsSyncedCount) }) : t("চাওয়া হয়নি")}
                          {!s.contactsRequestedAt && <RetryButton channelId={c.id} type="smb_app_state_sync" />}
                        </dd>
                        <dt className="text-muted">{t("Chat history:")}</dt>
                        <dd className="flex flex-wrap items-center gap-2">
                          {t(HISTORY_LABEL[s.historyStatus])}
                          {s.historyStatus !== "not_requested" && s.historyStatus !== "declined" && " · " + num(s.historyProgress) + "% · " + t("{n}টি মেসেজ", { n: num(s.historyMessageCount) })}
                          {!s.historyRequestedAt && <RetryButton channelId={c.id} type="history" />}
                        </dd>
                      </dl>
                    )}
                    {s?.lastError && <Alert tone="danger">{t(s.lastError)}</Alert>}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t("নতুন চ্যানেল যুক্ত করুন")}</h2>
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <ChannelBadge type="whatsapp" />
              <h3 className="text-base font-bold">{t("নতুন WhatsApp নম্বর (Coexistence)")}</h3>
            </div>
            <p className="text-sm text-muted">{t("প্রতিষ্ঠানের বিদ্যমান WhatsApp Business App নম্বর, নম্বর বা অ্যাপ না বদলে। কন্টাক্ট ও গ্রুপ অক্ষত থাকে।")}</p>
            {!allowed ? (
              <Alert tone="warning">{t("আসল নম্বর সংযুক্ত করা এখন বন্ধ (উন্নয়নের সময় শুধু Meta-র টেস্ট নম্বর)। go-live ধাপে সার্ভারের .env-এ ALLOW_REAL_CHANNEL_CONNECT=true দিলে এই বোতাম চালু হবে।")}</Alert>
            ) : !appId || !configId ? (
              <Alert tone="warning">{t("META_APP_ID ও META_ES_CONFIG_ID সেট করা নেই।")}</Alert>
            ) : (
              <ConnectWhatsApp appId={appId} configId={configId} graphVersion={graphVersion} />
            )}
          </Card>

          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <ChannelBadge type="messenger" />
              <h3 className="text-base font-bold">Facebook Page (Messenger)</h3>
            </div>
            <p className="text-sm text-muted">{t("Facebook দিয়ে লগইন করে আপনার পরিচালিত পেজ বেছে নিন। উন্নয়নের সময় শুধু টেস্ট পেজ সংযুক্ত করুন; আসল পেজ go-live ধাপে।")}</p>
            {!appId ? <Alert tone="warning">{t("META_APP_ID সেট করা নেই।")}</Alert> : <ConnectMessenger appId={appId} graphVersion={graphVersion} realAllowed={allowed} />}
          </Card>
        </div>
      </section>
    </PageShell>
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
