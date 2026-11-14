"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Alert, Card, Field, buttonClass, fieldClass } from "@/components/ui";
import { changePasswordAction, updateNameAction, type TeamFormState } from "@/core/auth/team-actions";
import { useI18n } from "@/lib/i18n/client";

export function NameForm({ name, email }: { name: string; email: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<TeamFormState, FormData>(updateNameAction, {});
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <h2 className="text-base font-bold">{t("আমার তথ্য")}</h2>
      <form action={action} className="space-y-3">
        <Field label={t("নাম")}>
          <input name="name" defaultValue={name} required maxLength={100} className={fieldClass} />
        </Field>
        <Field label={t("ইমেইল")} hint={t("ইমেইল বদলাতে অ্যাডমিনকে বলুন।")}>
          <input value={email} readOnly disabled className={fieldClass} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
            {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {t("সংরক্ষণ")}
          </button>
          {state.ok && <span role="status" className="text-sm text-success">{t(state.ok)}</span>}
          {state.error && <span role="alert" className="text-sm text-danger">{t(state.error)}</span>}
        </div>
      </form>
    </Card>
  );
}

export function PasswordForm({ forced }: { forced: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<TeamFormState, FormData>(changePasswordAction, {});
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <h2 className="text-base font-bold">{t("পাসওয়ার্ড বদলান")}</h2>
      {forced && <Alert tone="warning">{t("আপনার অ্যাকাউন্টে সাময়িক পাসওয়ার্ড আছে। কাজ শুরুর আগে নিজের পাসওয়ার্ড বানান।")}</Alert>}
      <form action={action} className="space-y-3">
        <Field label={t("বর্তমান পাসওয়ার্ড")}>
          <input name="current" type="password" required autoComplete="current-password" className={fieldClass} />
        </Field>
        <Field label={t("নতুন পাসওয়ার্ড")} hint={t("কমপক্ষে ১০ অক্ষর")}>
          <input name="next" type="password" required minLength={10} autoComplete="new-password" className={fieldClass} />
        </Field>
        <Field label={t("নতুন পাসওয়ার্ড আবার লিখুন")}>
          <input name="confirm" type="password" required minLength={10} autoComplete="new-password" className={fieldClass} />
        </Field>
        {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {t("পাসওয়ার্ড বদলান")}
        </button>
        <p className="text-xs text-muted">{t("বদলালে আপনার অন্য সব জায়গার লগইন বন্ধ হয়ে যাবে; এই ব্রাউজার চালু থাকবে।")}</p>
      </form>
    </Card>
  );
}
