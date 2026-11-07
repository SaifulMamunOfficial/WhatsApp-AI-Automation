import { Suspense } from "react";
import { asc, eq, and, isNull } from "drizzle-orm";
import { requireRole } from "@/core/auth/dal";
import { addArticleAction, deleteArticleAction, saveAiSettingsAction, toggleArticleAction, updateArticleAction } from "@/core/ai/actions";
import { aiProviderFromEnv } from "@/core/ai/providers";
import { aiConfig, DEFAULT_HANDOFF_TEXT } from "@/core/automation/config";
import { db } from "@/db";
import { automations, knowledgeBase } from "@/db/schema";

export const metadata = { title: "জ্ঞানভান্ডার ও AI — Saimum CRM" };

export default function KnowledgePage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">লোড হচ্ছে…</p>}>
      <Content />
    </Suspense>
  );
}

const field = "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const btn = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";

async function Content() {
  await requireRole("admin");
  const [articles, [ai]] = await Promise.all([
    db.select().from(knowledgeBase).orderBy(asc(knowledgeBase.createdAt)),
    db.select().from(automations).where(and(eq(automations.kind, "ai"), isNull(automations.channelId))).limit(1),
  ]);
  const cfg = aiConfig.safeParse(ai?.config ?? {});
  const settings = cfg.success ? cfg.data : { handoffText: DEFAULT_HANDOFF_TEXT, maxRepliesPerHour: 6 };
  const provider = aiProviderFromEnv();
  const enabledCount = articles.filter((a) => a.enabled).length;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-4">
      <section className="space-y-3">
        <h1 className="text-lg font-semibold">AI bot</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Keyword নিয়ম না মিললে bot জ্ঞানভান্ডার থেকে বাংলায় উত্তর দেয়। জ্ঞানভান্ডারে উত্তর না থাকলে, বা গ্রাহক মানুষ চাইলে/অভিযোগ করলে, bot মানুষের হাতে দিয়ে ওই কথোপকথনে চুপ করে যায় এবং ইনবক্সে ‘মানুষ দরকার’ দেখায়।
        </p>
        <p className={`rounded px-3 py-2 text-sm ${provider ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200" : "bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"}`}>
          {provider ? `AI provider প্রস্তুত: ${provider.name}।` : "AI provider নেই: সার্ভারের .env-এ ANTHROPIC_API_KEY (বা AI_PROVIDER=openai সহ OPENAI_API_KEY) দিন। না দিলে AI বন্ধ থাকে, বাকি bot চলে।"}
          {enabledCount === 0 && " জ্ঞানভান্ডারে চালু লেখা নেই, তাই AI চলবে না।"}
        </p>
        <form action={saveAiSettingsAction} className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={ai?.enabled ?? false} /> AI উত্তর চালু
          </label>
          <label className="block text-sm">
            মানুষের হাতে দেওয়ার সময় গ্রাহককে যা পাঠানো হবে
            <textarea name="handoffText" rows={2} maxLength={1000} defaultValue={settings.handoffText} className={`${field} mt-1`} />
          </label>
          <label className="block text-sm">
            একটা কথোপকথনে ঘণ্টায় সর্বোচ্চ AI উত্তর (এর বেশি হলে মানুষের হাতে)
            <input type="number" name="maxRepliesPerHour" min={1} max={60} defaultValue={settings.maxRepliesPerHour} className={`${field} mt-1 max-w-32`} />
          </label>
          <button type="submit" className={btn}>সংরক্ষণ</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">জ্ঞানভান্ডার ({articles.length}টি লেখা)</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          প্রতিটা লেখা এক বিষয়: যেমন ‘কোর্স ফি’, ‘ঠিকানা’, ‘ভর্তির সময়’। যা লিখবেন bot শুধু সেটুকুই বলবে, তাই দাম/তারিখ সঠিক রাখুন।
        </p>
        <ul className="space-y-3">
          {articles.map((a) => (
            <li key={a.id} className={`rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 ${a.enabled ? "" : "opacity-60"}`}>
              <form action={updateArticleAction} className="space-y-2">
                <input type="hidden" name="id" value={a.id} />
                <input name="title" required maxLength={200} defaultValue={a.title} className={field} />
                <textarea name="content" required rows={4} maxLength={4000} defaultValue={a.content} className={field} />
                <button type="submit" className={btn}>হালনাগাদ</button>
              </form>
              <div className="mt-2 flex gap-2">
                <form action={toggleArticleAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="enabled" value={String(!a.enabled)} />
                  <button type="submit" className={btn}>{a.enabled ? "বন্ধ করুন" : "চালু করুন"}</button>
                </form>
                <form action={deleteArticleAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className={btn}>মুছুন</button>
                </form>
              </div>
            </li>
          ))}
          {articles.length === 0 && <li className="text-sm text-zinc-500">কোনো লেখা নেই।</li>}
        </ul>

        <form action={addArticleAction} className="space-y-2 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <h3 className="text-sm font-medium">নতুন লেখা</h3>
          <input name="title" required maxLength={200} placeholder="শিরোনাম (যেমন: কোর্স ফি)" className={field} />
          <textarea name="content" required rows={4} maxLength={4000} placeholder="বিস্তারিত তথ্য" className={field} />
          <button type="submit" className={btn}>যোগ করুন</button>
        </form>
      </section>
    </main>
  );
}
