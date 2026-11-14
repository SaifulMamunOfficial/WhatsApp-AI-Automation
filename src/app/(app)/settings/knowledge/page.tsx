import { Suspense } from "react";
import { asc, eq, and, isNull } from "drizzle-orm";
import { requireRole } from "@/core/auth/dal";
import { getActiveProvider } from "@/core/ai/config";
import { aiConfig, DEFAULT_HANDOFF_TEXT } from "@/core/automation/config";
import { db } from "@/db";
import { automations, knowledgeBase } from "@/db/schema";
import { PageHeader, PageShell } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { KnowledgeView, type ArticleView } from "./knowledge-view";

export const metadata = { title: "Knowledge base & AI — Saimum CRM" };

export default function KnowledgePage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireRole("admin");
  const { t, intl } = await getT();
  const [articles, [ai]] = await Promise.all([
    db.select().from(knowledgeBase).orderBy(asc(knowledgeBase.createdAt)),
    db.select().from(automations).where(and(eq(automations.kind, "ai"), isNull(automations.channelId))).limit(1),
  ]);
  const cfg = aiConfig.safeParse(ai?.config ?? {});
  const settings = cfg.success ? cfg.data : { handoffText: DEFAULT_HANDOFF_TEXT, maxRepliesPerHour: 6 };
  const provider = await getActiveProvider(db);
  const date = new Intl.DateTimeFormat(intl, { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" });

  const views: ArticleView[] = articles.map((a) => ({ id: a.id, title: a.title, content: a.content, enabled: a.enabled, updated: date.format(a.updatedAt) }));

  return (
    <PageShell>
      <PageHeader title={t("জ্ঞানভান্ডার ও AI")} description={t("AI bot যে তথ্য থেকে গ্রাহকের প্রশ্নের উত্তর দেয় আর তার নিয়ম এখানে ঠিক করুন।")} />
      <KnowledgeView
        articles={views}
        settings={{ enabled: ai?.enabled ?? false, handoffText: settings.handoffText, maxRepliesPerHour: settings.maxRepliesPerHour, provider: provider ? provider.name : null }}
      />
    </PageShell>
  );
}
