"use client";

import { useActionState } from "react";
import { submitTemplateAction, type BroadcastFormState } from "@/core/broadcast/actions";
import { buttonClass, fieldClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

const field = fieldClass;

export function TemplateForm({ channels }: { channels: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<BroadcastFormState, FormData>(submitTemplateAction, {});
  return (
    <form action={action} className="space-y-2 rounded-xl border border-dashed border-border-strong bg-surface-2/40 p-4">
      <select name="channelId" className={field}>
        {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input name="name" required pattern="[a-z0-9_]+" maxLength={512} placeholder={t("নাম: ছোট হাতের ইংরেজি, সংখ্যা ও _ (যেমন eid_offer_2026)")} className={field} />
      <div className="flex gap-2">
        <input name="language" defaultValue="bn" required className={`${field} w-28`} aria-label={t("ভাষার কোড")} />
        <select name="category" defaultValue="marketing" className={field}>
          <option value="marketing">{t("Marketing (প্রচার)")}</option>
          <option value="utility">{t("Utility (লেনদেন/তথ্য)")}</option>
        </select>
      </div>
      <textarea name="bodyText" required rows={4} maxLength={1024} placeholder={t("মেসেজের লেখা। পরিবর্তনশীল অংশের জন্য {{1}}, {{2}} লিখুন। যেমন: হ্যালো {{1}}, {{2}} অফার চলছে।")} className={field} />
      <textarea name="examples" rows={2} placeholder={t("প্রতিটা {{ }}-এর জন্য একটা নমুনা মান, প্রতি লাইনে একটা (Meta এটা চায়)")} className={field} />
      {state.error && <p role="alert" className="text-sm text-danger">{t(state.error)}</p>}
      {state.ok && <p role="status" className="text-sm text-success">{t(state.ok)}</p>}
      <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>{pending ? t("অপেক্ষা করুন…") : t("Meta-র কাছে জমা দিন")}</button>
    </form>
  );
}
