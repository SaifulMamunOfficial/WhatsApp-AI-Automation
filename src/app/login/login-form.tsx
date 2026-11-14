"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Alert, buttonClass, Field, fieldClass } from "@/components/ui";
import { login, type LoginState } from "@/core/auth/actions";
import { useI18n } from "@/lib/i18n/client";

export function LoginForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="space-y-4">
      <Field label={t("ইমেইল")}>
        <input name="email" type="email" autoComplete="username" required autoFocus className={fieldClass} />
      </Field>
      <Field label={t("পাসওয়ার্ড")}>
        <input name="password" type="password" autoComplete="current-password" required className={fieldClass} />
      </Field>
      {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
      <button type="submit" disabled={pending} className={buttonClass("primary", "md", "w-full")}>
        {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
        {pending ? t("অপেক্ষা করুন…") : t("লগইন")}
      </button>
    </form>
  );
}
