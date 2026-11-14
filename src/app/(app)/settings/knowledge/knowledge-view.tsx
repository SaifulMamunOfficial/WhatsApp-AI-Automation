"use client";

import { BookOpen, Bot, CircleCheck, Gauge, Loader2, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { Modal } from "@/components/modal";
import { Alert, Badge, Card, EmptyState, Field, StatCard, buttonClass, cn, fieldClass } from "@/components/ui";
import { addArticleAction, deleteArticleAction, saveAiSettingsAction, toggleArticleAction, updateArticleAction, type KnowledgeFormState } from "@/core/ai/actions";
import { useI18n } from "@/lib/i18n/client";

export interface ArticleView {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  updated: string;
}

export interface AiSettingsView {
  enabled: boolean;
  handoffText: string;
  maxRepliesPerHour: number;
  /** Name of the AI service that will be used, or null when no key is set. */
  provider: string | null;
}

function ArticleForm({ article, onClose }: { article?: ArticleView; onClose: () => void }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<KnowledgeFormState, FormData>(article ? updateArticleAction : addArticleAction, {});
  useEffect(() => {
    if (state.okAt) onClose();
  }, [state.okAt, onClose]);

  return (
    <form action={action} className="space-y-3">
      {article && <input type="hidden" name="id" value={article.id} />}
      <Field label={t("শিরোনাম")}>
        <input name="title" required maxLength={200} autoFocus defaultValue={article?.title} placeholder={t("শিরোনাম (যেমন: কোর্স ফি)")} className={fieldClass} />
      </Field>
      <Field label={t("বিস্তারিত তথ্য")} hint={t("bot শুধু এখানে যা লেখা আছে সেটুকুই বলবে, তাই দাম/তারিখ সঠিক রাখুন।")}>
        <textarea name="content" required rows={8} maxLength={4000} defaultValue={article?.content} className={fieldClass} />
      </Field>
      {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>{t("বাতিল করুন")}</button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {article ? t("হালনাগাদ") : t("যোগ করুন")}
        </button>
      </div>
    </form>
  );
}

function AiSettingsCard({ settings }: { settings: AiSettingsView }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<KnowledgeFormState, FormData>(saveAiSettingsAction, {});
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold">{t("AI bot")}</h2>
        <Badge tone={settings.enabled ? "success" : "neutral"}>{settings.enabled ? t("চালু") : t("বন্ধ")}</Badge>
      </div>
      <p className="max-w-prose text-sm text-muted">
        {t("Keyword নিয়ম না মিললে bot জ্ঞানভান্ডার থেকে বাংলায় উত্তর দেয়। জ্ঞানভান্ডারে উত্তর না থাকলে, বা গ্রাহক মানুষ চাইলে/অভিযোগ করলে, bot মানুষের হাতে দিয়ে ওই কথোপকথনে চুপ করে যায় এবং ইনবক্সে ‘মানুষ দরকার’ দেখায়।")}
      </p>
      {settings.provider ? (
        <Alert tone="success">{t("AI provider প্রস্তুত: {name}।", { name: settings.provider })}</Alert>
      ) : (
        <Alert tone="warning">
          {t("AI provider নেই: ‘কনফিগারেশন’ পেজে একটা API key দিন। না দিলে AI বন্ধ থাকে, বাকি bot চলে।")}{" "}
          <Link href="/settings/configuration" className="font-semibold underline">{t("কনফিগারেশন")}</Link>
        </Alert>
      )}
      {/* key: React resets the form after the action, so remount when the saved values change */}
      <form key={`${settings.enabled}|${settings.maxRepliesPerHour}|${settings.handoffText}`} action={action} className="space-y-3">
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="size-4" /> {t("AI উত্তর চালু")}
        </label>
        <Field label={t("মানুষের হাতে দেওয়ার সময় গ্রাহককে যা পাঠানো হবে")}>
          <textarea name="handoffText" rows={3} maxLength={1000} defaultValue={settings.handoffText} className={fieldClass} />
        </Field>
        <Field label={t("একটা কথোপকথনে ঘণ্টায় সর্বোচ্চ AI উত্তর (এর বেশি হলে মানুষের হাতে)")}>
          <input type="number" name="maxRepliesPerHour" min={1} max={60} defaultValue={settings.maxRepliesPerHour} className={cn(fieldClass, "max-w-32")} />
        </Field>
        {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
            {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {t("সংরক্ষণ")}
          </button>
          {state.ok && <span role="status" className="text-sm text-success">{t(state.ok)}</span>}
        </div>
      </form>
    </Card>
  );
}

export function KnowledgeView({ articles, settings }: { articles: ArticleView[]; settings: AiSettingsView }) {
  const { t, num } = useI18n();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | "on" | "off">("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ArticleView | null>(null);

  const enabledCount = articles.filter((a) => a.enabled).length;
  const q = query.trim().toLowerCase();
  const shown = articles.filter((a) => (!q || a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q)) && (!status || (status === "on" ? a.enabled : !a.enabled)));
  const iconBtn = "inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";
  const aiWorking = settings.enabled && !!settings.provider && enabledCount > 0;

  return (
    <div className="space-y-6">
      <section aria-label={t("মূল সংখ্যা")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<BookOpen className="size-5" />} label={t("মোট লেখা")} value={num(articles.length)} />
        <StatCard icon={<CircleCheck className="size-5" />} label={t("চালু লেখা")} value={num(enabledCount)} tone="success" hint={enabledCount === 0 ? t("চালু লেখা না থাকলে AI চলবে না") : undefined} />
        <StatCard icon={<Bot className="size-5" />} label={t("AI উত্তর")} value={aiWorking ? t("চালু") : t("বন্ধ")} tone={aiWorking ? "success" : undefined} />
        <StatCard icon={<Gauge className="size-5" />} label={t("ঘণ্টায় সর্বোচ্চ AI উত্তর")} value={num(settings.maxRepliesPerHour)} hint={t("প্রতি কথোপকথনে")} />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[26rem_1fr]">
        <AiSettingsCard settings={settings} />

        <Card className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:p-4">
            <h2 className="mr-2 text-base font-bold">{t("জ্ঞানভান্ডার")}</h2>
            <div className="relative min-w-40 flex-1 sm:max-w-xs">
              <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("লেখা খুঁজুন")} placeholder={t("লেখা খুঁজুন")} className={cn(fieldClass, "!min-h-10 pl-10")} />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label={t("অবস্থা")} className={cn(fieldClass, "!min-h-10 !w-auto")}>
              <option value="">{t("সব অবস্থা")}</option>
              <option value="on">{t("চালু")}</option>
              <option value="off">{t("বন্ধ")}</option>
            </select>
            <button type="button" onClick={() => setAdding(true)} className={cn(buttonClass("primary", "md"), "sm:ml-auto")}>
              <Plus aria-hidden className="size-4" />
              {t("নতুন লেখা")}
            </button>
          </div>

          <p className="border-b border-border bg-surface-2/40 px-4 py-2.5 text-sm text-muted">
            {t("প্রতিটা লেখা এক বিষয়: যেমন ‘কোর্স ফি’, ‘ঠিকানা’, ‘ভর্তির সময়’। যা লিখবেন bot শুধু সেটুকুই বলবে, তাই দাম/তারিখ সঠিক রাখুন।")}
          </p>

          {shown.length === 0 ? (
            <EmptyState icon={<BookOpen aria-hidden className="size-8" />} title={articles.length === 0 ? t("কোনো লেখা নেই।") : t("কিছু মেলেনি।")} />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="bg-surface-2/60 text-xs font-bold uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">{t("শিরোনাম")}</th>
                    <th scope="col" className="px-4 py-3">{t("বিস্তারিত তথ্য")}</th>
                    <th scope="col" className="px-4 py-3">{t("অবস্থা")}</th>
                    <th scope="col" className="px-4 py-3">{t("হালনাগাদ")}</th>
                    <th scope="col" className="px-4 py-3 text-right">{t("কাজ")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map((a) => (
                    <tr key={a.id} className={cn("transition-colors hover:bg-surface-2/40", !a.enabled && "opacity-70")}>
                      <td className="max-w-56 px-4 py-3 font-semibold"><p className="line-clamp-2">{a.title}</p></td>
                      <td className="max-w-md px-4 py-3 text-muted"><p className="line-clamp-2 whitespace-pre-wrap" title={a.content}>{a.content}</p></td>
                      <td className="px-4 py-3"><Badge tone={a.enabled ? "success" : "neutral"}>{a.enabled ? t("চালু") : t("বন্ধ")}</Badge></td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{a.updated}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-0.5">
                          <button type="button" className={iconBtn} title={t("সম্পাদনা")} aria-label={t("সম্পাদনা") + ": " + a.title} onClick={() => setEditing(a)}>
                            <Pencil aria-hidden className="size-[18px]" />
                          </button>
                          <ConfirmAction
                            action={toggleArticleAction}
                            fields={{ id: a.id, enabled: String(!a.enabled) }}
                            title={a.enabled ? t("লেখা বন্ধ করুন") : t("লেখা চালু করুন")}
                            message={a.enabled ? t("“{name}” থেকে bot আর উত্তর দেবে না। বন্ধ করবেন?", { name: a.title }) : t("“{name}” থেকে bot আবার উত্তর দেবে। চালু করবেন?", { name: a.title })}
                            confirmLabel={t("নিশ্চিত করুন")}
                            className={iconBtn}
                            ariaLabel={(a.enabled ? t("বন্ধ করুন") : t("চালু করুন")) + ": " + a.title}
                          >
                            <Power aria-hidden className="size-[18px]" />
                          </ConfirmAction>
                          <ConfirmAction
                            action={deleteArticleAction}
                            fields={{ id: a.id }}
                            title={t("লেখা মুছুন")}
                            message={t("“{name}” লেখাটা মুছে ফেলবেন? এটা ফেরানো যায় না।", { name: a.title })}
                            confirmLabel={t("মুছুন")}
                            danger
                            className={cn(iconBtn, "hover:bg-danger-soft hover:text-danger")}
                            ariaLabel={t("মুছুন") + ": " + a.title}
                          >
                            <Trash2 aria-hidden className="size-[18px]" />
                          </ConfirmAction>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="border-t border-border px-4 py-2.5 text-xs text-muted">{t("{n}টির মধ্যে {m}টি দেখানো হচ্ছে", { n: num(articles.length), m: num(shown.length) })}</div>
        </Card>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title={t("নতুন লেখা")} size="lg">
        {adding && <ArticleForm onClose={() => setAdding(false)} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t("লেখা সম্পাদনা")} size="lg">
        {editing && <ArticleForm key={editing.id} article={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
