"use client";

import { useActionState } from "react";
import { createBroadcastAction, type BroadcastFormState } from "@/core/broadcast/actions";
import { buttonClass, fieldClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

const field = fieldClass;

export function NewBroadcastForm(p: { channelId: string; templateId: string; tagId: string; body: string; variables: number; reach: number; realChannel: boolean }) {
  const { t, num } = useI18n();
  const [state, action, pending] = useActionState<BroadcastFormState, FormData>(createBroadcastAction, {});

  return (
    <form action={action} className="space-y-3 rounded-xl border border-border bg-surface-2/50 p-3.5">
      <input type="hidden" name="channelId" value={p.channelId} />
      <input type="hidden" name="templateId" value={p.templateId} />
      <input type="hidden" name="tagId" value={p.tagId} />

      <div className="rounded bg-surface-2 p-2 text-sm whitespace-pre-wrap">{p.body || t("(টেমপ্লেটের লেখা পাওয়া যায়নি)")}</div>
      <p className="text-sm">
        {t("পৌঁছবে:")} <strong>{num(p.reach)}</strong> {t("জন (শুধু সম্মতি দেওয়া ও WhatsApp নম্বরধারী)")}
        {p.reach === 0 && <span className="text-danger"> — {t("আগে কন্টাক্টদের সম্মতি (opt-in) দিন।")}</span>}
      </p>
      {p.realChannel && <p className="rounded bg-warning-soft px-2 py-1 text-sm text-fg">{t("এটা আসল চ্যানেল। সার্ভারে ALLOW_BROADCAST=true না থাকলে শুরু করা যাবে না।")}</p>}

      <label className="block text-sm">{t("Broadcast-এর নাম (শুধু আপনার জন্য)")}
        <input name="name" required maxLength={120} placeholder={t("যেমন: ঈদ অফার")} className={`${field} mt-1`} />
      </label>

      {Array.from({ length: p.variables }, (_, i) => i + 1).map((n) => (
        <div key={n} className="grid grid-cols-[auto_1fr] items-center gap-2 text-sm">
          <span className="font-mono">{`{{${n}}}`}</span>
          <div className="flex gap-2">
            <select name={`p${n}_kind`} defaultValue="fixed" className={`${field} w-44 shrink-0`}>
              <option value="fixed">{t("সবার জন্য একই লেখা")}</option>
              <option value="first_name">{t("কন্টাক্টের প্রথম নাম")}</option>
            </select>
            <input name={`p${n}_value`} required placeholder={t("লেখা (নাম-মোডে: নাম না থাকলে যা বসবে, যেমন ‘গ্রাহক’)")} className={field} />
          </div>
        </div>
      ))}

      {state.error && <p role="alert" className="rounded bg-danger-soft px-3 py-2 text-sm text-fg">{t(state.error)}</p>}
      <button type="submit" disabled={pending || p.reach === 0} className={buttonClass("primary")}>
        {pending ? t("অপেক্ষা করুন…") : t("খসড়া বানান ও প্রাপক ঠিক করুন")}
      </button>
      <p className="text-xs text-muted">{t("এতে কিছু পাঠানো হয় না। পরের পাতায় প্রাপকের সংখ্যা লিখে নিশ্চিত করলে তবেই পাঠানো শুরু হবে।")}</p>
    </form>
  );
}
