"use client";

import { useActionState } from "react";
import { startBroadcastAction, type BroadcastFormState } from "@/core/broadcast/actions";
import { buttonClass, fieldClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";

export function StartForm({ id, total }: { id: string; total: number }) {
  const { t, num } = useI18n();
  const [state, action, pending] = useActionState<BroadcastFormState, FormData>(startBroadcastAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm">
        {t("নিশ্চিত করতে প্রাপকের সংখ্যা লিখুন ({n})", { n: num(total) })}
        <input name="confirmCount" required inputMode="numeric" autoComplete="off" className={`${fieldClass} mt-1 w-32`} />
      </label>
      {state.error && <p role="alert" className="text-sm text-danger">{t(state.error)}</p>}
      {state.ok && <p role="status" className="text-sm text-success">{t(state.ok)}</p>}
      <button type="submit" disabled={pending} className={buttonClass("danger")}>
        {pending ? t("অপেক্ষা করুন…") : t("পাঠান")}
      </button>
    </form>
  );
}
