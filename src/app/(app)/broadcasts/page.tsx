import Link from "next/link";
import { Suspense } from "react";
import { desc, eq } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { broadcasts, channels, templates } from "@/db/schema";
import { formatFull } from "@/lib/format";
import { PageHeader, PageShell, buttonClass } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { BroadcastsView, type BroadcastStatus } from "./broadcasts-view";

export const metadata = { title: "Broadcasts — Saimum CRM" };

export default function BroadcastsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

export const STATUS_LABEL = { draft: "খসড়া (পাঠানো হয়নি)", sending: "পাঠানো হচ্ছে", paused: "থামানো", completed: "শেষ", cancelled: "বাতিল" } as const;

async function Content() {
  await requireRole("admin");
  const { t, intl } = await getT();
  const rows = await db
    .select({ b: broadcasts, channel: channels.name, template: templates.name })
    .from(broadcasts)
    .innerJoin(channels, eq(channels.id, broadcasts.channelId))
    .innerJoin(templates, eq(templates.id, broadcasts.templateId))
    .orderBy(desc(broadcasts.createdAt))
    .limit(100);

  const statusLabels = Object.fromEntries((Object.keys(STATUS_LABEL) as BroadcastStatus[]).map((s) => [s, t(STATUS_LABEL[s])])) as Record<BroadcastStatus, string>;

  return (
    <PageShell>
      <PageHeader
        title={t("Broadcast (WhatsApp template)")}
        description={t("শুধু সম্মতি (opt-in) দেওয়া কন্টাক্টদের কাছে, শুধু Meta-র অনুমোদিত টেমপ্লেটে যায়।")}
        actions={
          <>
            <Link href="/broadcasts/templates" className={buttonClass("secondary", "md")}>
              <FileText aria-hidden className="size-4" />
              {t("টেমপ্লেট তালিকা")}
            </Link>
            <Link href="/broadcasts/new" className={buttonClass("primary", "md")}>
              <Plus aria-hidden className="size-4" />
              {t("নতুন broadcast")}
            </Link>
          </>
        }
      />
      <BroadcastsView
        statusLabels={statusLabels}
        rows={rows.map(({ b, channel, template }) => ({
          id: b.id,
          name: b.name,
          channel,
          template,
          status: b.status,
          statusLabel: statusLabels[b.status],
          total: b.totalCount,
          sent: b.sentCount,
          failed: b.failedCount,
          created: formatFull(b.createdAt, intl),
        }))}
      />
    </PageShell>
  );
}
