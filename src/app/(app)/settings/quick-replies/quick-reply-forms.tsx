"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Alert, Card, Field, buttonClass, cn, fieldClass } from "@/components/ui";
import { addQuickReplyAction, deleteQuickReplyAction, updateQuickReplyAction, type QuickReplyFormState } from "@/core/inbox/quick-reply-actions";
import type { QuickReply } from "@/core/inbox/quick-reply-match";
import { useI18n } from "@/lib/i18n/client";

export function AddQuickReplyForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<QuickReplyFormState, FormData>(addQuickReplyAction, {});
  // key: remounting after a success clears the fields (React 19 resets uncontrolled forms anyway, this also clears errors).
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <h2 className="text-base font-bold">{t("নতুন দ্রুত উত্তর")}</h2>
      <form key={state.okAt ?? 0} action={action} className="space-y-3">
        <Field label={t("শর্টকাট")} hint={t("ছোট হাতের ইংরেজি অক্ষর, সংখ্যা, - বা _ (যেমন office)। ইনবক্সে / লিখে এটা পাবেন।")}>
          <input name="shortcut" required maxLength={31} autoComplete="off" spellCheck={false} placeholder="office" className={cn(fieldClass, "font-mono")} />
        </Field>
        <Field label={t("উত্তরের লেখা")}>
          <textarea name="body" required rows={4} maxLength={2000} className={fieldClass} />
        </Field>
        {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {t("যোগ করুন")}
        </button>
      </form>
    </Card>
  );
}

export function QuickReplyRow({ r }: { r: QuickReply }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<QuickReplyFormState, FormData>(updateQuickReplyAction, {});
  return (
    <li className="space-y-3 px-4 py-4">
      <form action={action} className="space-y-2">
        <input type="hidden" name="id" value={r.id} />
        <div className="flex items-center gap-2">
          <span aria-hidden className="font-mono text-lg font-semibold text-brand">/</span>
          <input name="shortcut" defaultValue={r.shortcut} required maxLength={31} aria-label={t("শর্টকাট")} spellCheck={false} className={cn(fieldClass, "max-w-xs font-mono")} />
        </div>
        <textarea name="body" defaultValue={r.body} required rows={3} maxLength={2000} aria-label={t("উত্তরের লেখা")} className={fieldClass} />
        {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>
            {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {t("হালনাগাদ")}
          </button>
          {state.okAt && !state.error && <span role="status" className="text-sm text-success">{t("সেভ হয়েছে।")}</span>}
        </div>
      </form>
      <form action={deleteQuickReplyAction}>
        <input type="hidden" name="id" value={r.id} />
        <button type="submit" className={buttonClass("secondary", "sm", "text-danger")}>{t("মুছুন")}</button>
      </form>
    </li>
  );
}
