import { Suspense } from "react";
import { asc, eq, and, isNull } from "drizzle-orm";
import { requireRole } from "@/core/auth/dal";
import { addArticleAction, deleteArticleAction, saveAiSettingsAction, toggleArticleAction, updateArticleAction } from "@/core/ai/actions";
import { getActiveProvider } from "@/core/ai/config";
import { aiConfig, DEFAULT_HANDOFF_TEXT } from "@/core/automation/config";
import { db } from "@/db";
import { automations, knowledgeBase } from "@/db/schema";
import { buttonClass, fieldClass } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Knowledge base & AI — Saimum CRM" };

export default function KnowledgePage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

const field = fieldClass;
const btn = buttonClass("secondary", "sm");

async function Content() {
  await requireRole("admin");
  const { t, num } = await getT();
  const [articles, [ai]] = await Promise.all([
    db.select().from(knowledgeBase).orderBy(asc(knowledgeBase.createdAt)),
    db.select().from(automations).where(and(eq(automations.kind, "ai"), isNull(automations.channelId))).limit(1),
  ]);
  const cfg = aiConfig.safeParse(ai?.config ?? {});
  const settings = cfg.success ? cfg.data : { handoffText: DEFAULT_HANDOFF_TEXT, maxRepliesPerHour: 6 };
  const provider = await getActiveProvider(db);
  const enabledCount = articles.filter((a) => a.enabled).length;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h1 className="text-2xl font-bold tracking-tight">AI bot</h1>
        <p className="text-sm text-muted">
          {t("Keyword নিয়ম না মিললে bot জ্ঞানভান্ডার থেকে বাংলায় উত্তর দেয়। জ্ঞানভান্ডারে উত্তর না থাকলে, বা গ্রাহক মানুষ চাইলে/অভিযোগ করলে, bot মানুষের হাতে দিয়ে ওই কথোপকথনে চুপ করে যায় এবং ইনবক্সে ‘মানুষ দরকার’ দেখায়।")}
        </p>
        <p className={`rounded px-3 py-2 text-sm ${provider ? "bg-success-soft text-fg" : "bg-warning-soft text-fg"}`}>
          {provider ? t("AI provider প্রস্তুত: {name}।", { name: provider.name }) : t("AI provider নেই: ‘কনফিগারেশন’ পেজে একটা API key দিন। না দিলে AI বন্ধ থাকে, বাকি bot চলে।")}
          {enabledCount === 0 && " " + t("জ্ঞানভান্ডারে চালু লেখা নেই, তাই AI চলবে না।")}
        </p>
        <form action={saveAiSettingsAction} className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={ai?.enabled ?? false} /> {t("AI উত্তর চালু")}
          </label>
          <label className="block text-sm">
            {t("মানুষের হাতে দেওয়ার সময় গ্রাহককে যা পাঠানো হবে")}
            <textarea name="handoffText" rows={2} maxLength={1000} defaultValue={settings.handoffText} className={`${field} mt-1`} />
          </label>
          <label className="block text-sm">
            {t("একটা কথোপকথনে ঘণ্টায় সর্বোচ্চ AI উত্তর (এর বেশি হলে মানুষের হাতে)")}
            <input type="number" name="maxRepliesPerHour" min={1} max={60} defaultValue={settings.maxRepliesPerHour} className={`${field} mt-1 max-w-32`} />
          </label>
          <button type="submit" className={btn}>{t("সংরক্ষণ")}</button>
        </form>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h2 className="text-base font-bold">{t("জ্ঞানভান্ডার ({n}টি লেখা)", { n: num(articles.length) })}</h2>
        <p className="text-sm text-muted">
          {t("প্রতিটা লেখা এক বিষয়: যেমন ‘কোর্স ফি’, ‘ঠিকানা’, ‘ভর্তির সময়’। যা লিখবেন bot শুধু সেটুকুই বলবে, তাই দাম/তারিখ সঠিক রাখুন।")}
        </p>
        <ul className="space-y-3">
          {articles.map((a) => (
            <li key={a.id} className={`rounded-xl border border-border bg-surface-2/50 p-3.5 ${a.enabled ? "" : "opacity-60"}`}>
              <form action={updateArticleAction} className="space-y-2">
                <input type="hidden" name="id" value={a.id} />
                <input name="title" required maxLength={200} defaultValue={a.title} className={field} />
                <textarea name="content" required rows={4} maxLength={4000} defaultValue={a.content} className={field} />
                <button type="submit" className={btn}>{t("হালনাগাদ")}</button>
              </form>
              <div className="mt-2 flex gap-2">
                <form action={toggleArticleAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="enabled" value={String(!a.enabled)} />
                  <button type="submit" className={btn}>{a.enabled ? t("বন্ধ করুন") : t("চালু করুন")}</button>
                </form>
                <form action={deleteArticleAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className={btn}>{t("মুছুন")}</button>
                </form>
              </div>
            </li>
          ))}
          {articles.length === 0 && <li className="text-sm text-muted">{t("কোনো লেখা নেই।")}</li>}
        </ul>

        <form action={addArticleAction} className="space-y-2 rounded-xl border border-dashed border-border-strong bg-surface-2/40 p-4">
          <h3 className="text-sm font-medium">{t("নতুন লেখা")}</h3>
          <input name="title" required maxLength={200} placeholder={t("শিরোনাম (যেমন: কোর্স ফি)")} className={field} />
          <textarea name="content" required rows={4} maxLength={4000} placeholder={t("বিস্তারিত তথ্য")} className={field} />
          <button type="submit" className={btn}>{t("যোগ করুন")}</button>
        </form>
      </section>
    </main>
  );
}
