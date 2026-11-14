"use client";

import { useActionState } from "react";
import { importContactsAction, type ImportState } from "@/core/contacts/actions";
import { buttonClass, fieldClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

const field = fieldClass;

export function ImportForm({ channels }: { channels: { id: string; name: string }[] }) {
  const { t, num } = useI18n();
  const [state, action, pending] = useActionState<ImportState, FormData>(importContactsAction, {});
  const r = state.result;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <label className="block text-sm">
          {t("চ্যানেল বাছুন")}
          <select name="channelId" className={`${field} mt-1`}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          {t("CSV ফাইল")}
          <input type="file" name="file" accept=".csv,text/csv,text/plain" required className={`${field} mt-1`} />
        </label>
        <label className="block text-sm">
          {t("সবার জন্য একটা ট্যাগ (ঐচ্ছিক)")}
          <input name="extraTag" maxLength={40} placeholder={t("যেমন: ২০২৬ ব্যাচ")} className={`${field} mt-1`} />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="optIn" className="mt-1" />
          <span>{t("এই ফাইলের সবাই প্রতিষ্ঠানের কাছ থেকে মেসেজ (broadcast) পেতে সম্মতি দিয়েছেন, আমি নিশ্চিত। (টিক না দিলে তারা broadcast পাবে না।)")}</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dryRun" defaultChecked /> {t("আগে পরীক্ষা করুন (কিছু সেভ হবে না)")}
        </label>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? t("অপেক্ষা করুন…") : t("চালান")}
        </button>
      </form>

      {state.error && <p role="alert" className="rounded bg-danger-soft px-3 py-2 text-sm text-fg">{t(state.error)}</p>}

      {r?.fatal && <p role="alert" className="rounded bg-danger-soft px-3 py-2 text-sm text-fg">{t(r.fatal)}</p>}

      {r && !r.fatal && (
        <div role="status" className="space-y-2 rounded border border-border p-3 text-sm">
          <p className="font-medium">{r.dryRun ? t("পরীক্ষার ফল (কিছু সেভ হয়নি)") : t("আমদানি সম্পন্ন")}</p>
          <ul className="list-inside list-disc">
            <li>{t("নতুন কন্টাক্ট:")} {num(r.created)}</li>
            <li>{t("আগে থেকে ছিল (ট্যাগ যোগ হয়েছে):")} {num(r.updated)}</li>
            <li>{t("ফাইলে একই নম্বর বারবার:")} {num(r.duplicatesInFile)}</li>
            <li>{t("নতুন ট্যাগ:")} {num(r.tagsCreated)}</li>
            <li>{t("ত্রুটিপূর্ণ সারি:")} {num(r.errors.length)}</li>
          </ul>
          {r.errors.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded bg-surface-2 p-2 text-xs">
              {r.errors.slice(0, 100).map((e) => (
                <li key={`${e.line}-${e.message}`}>{t("সারি {line}:", { line: num(e.line) })} {t(e.message)}</li>
              ))}
              {r.errors.length > 100 && <li>{t("…আরও {n}টি", { n: num(r.errors.length - 100) })}</li>}
            </ul>
          )}
          {r.dryRun && <p className="text-muted">{t("ঠিক থাকলে ‘আগে পরীক্ষা করুন’ টিক তুলে আবার চালান।")}</p>}
        </div>
      )}
    </div>
  );
}
