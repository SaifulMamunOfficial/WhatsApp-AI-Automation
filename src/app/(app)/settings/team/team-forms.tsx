"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { Alert, Badge, Avatar, Card, Field, buttonClass, cn, fieldClass } from "@/components/ui";
import { createMemberAction, memberAction, type TeamFormState } from "@/core/auth/team-actions";
import { useI18n } from "@/lib/i18n/client";

export interface MemberView {
  id: string;
  name: string;
  email: string;
  role: "admin" | "agent";
  active: boolean;
  mustChangePassword: boolean;
  lastLogin: string;
  isMe: boolean;
}

/** A temporary password is shown once: it cannot be looked up again. */
function TempPassword({ password }: { password: string }) {
  const { t } = useI18n();
  return (
    <Alert tone="warning">
      <p className="font-semibold">{t("সাময়িক পাসওয়ার্ড (এখনই কপি করে সদস্যকে দিন, আর দেখানো হবে না):")}</p>
      <p className="mt-1 select-all rounded-lg bg-surface px-3 py-2 font-mono text-base">{password}</p>
      <p className="mt-1 text-xs">{t("প্রথম লগইনেই তাঁকে নিজের পাসওয়ার্ড বানাতে হবে।")}</p>
    </Alert>
  );
}

export function AddMemberForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<TeamFormState, FormData>(createMemberAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.okAt) ref.current?.reset();
  }, [state.okAt]);

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <h2 className="text-base font-bold">{t("নতুন সদস্য")}</h2>
      <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
        <Field label={t("নাম")}>
          <input name="name" required maxLength={100} className={fieldClass} />
        </Field>
        <Field label={t("ইমেইল")}>
          <input name="email" type="email" required maxLength={200} autoComplete="off" className={fieldClass} />
        </Field>
        <Field label={t("রোল")}>
          <select name="role" defaultValue="agent" className={fieldClass}>
            <option value="agent">{t("এজেন্ট")}</option>
            <option value="admin">{t("অ্যাডমিন")}</option>
          </select>
        </Field>
        <Field label={t("সাময়িক পাসওয়ার্ড (ফাঁকা রাখলে নিজে তৈরি হবে)")}>
          <input name="password" type="text" autoComplete="off" spellCheck={false} placeholder={t("কমপক্ষে ১০ অক্ষর")} className={cn(fieldClass, "font-mono")} />
        </Field>
        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
            {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {t("সদস্য যোগ করুন")}
          </button>
        </div>
      </form>
      {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
      {state.ok && <Alert tone="success">{t(state.ok)}</Alert>}
      {state.temporaryPassword && <TempPassword password={state.temporaryPassword} />}
    </Card>
  );
}

export function MemberRow({ m }: { m: MemberView }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<TeamFormState, FormData>(memberAction, {});
  const small = buttonClass("secondary", "sm");

  return (
    <li className={cn("space-y-3 px-4 py-4", !m.active && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={m.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {m.name} {m.isMe && <span className="font-normal text-muted">({t("আপনি")})</span>}
          </p>
          <p className="truncate text-sm text-muted">{m.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={m.role === "admin" ? "brand" : "neutral"}>{m.role === "admin" ? t("অ্যাডমিন") : t("এজেন্ট")}</Badge>
          <Badge tone={m.active ? "success" : "danger"}>{m.active ? t("সক্রিয়") : t("বন্ধ")}</Badge>
          {m.mustChangePassword && <Badge tone="warning">{t("পাসওয়ার্ড বদলানো বাকি")}</Badge>}
        </div>
        <p className="w-full text-xs text-muted sm:w-auto">{t("শেষ লগইন: {time}", { time: m.lastLogin })}</p>
      </div>

      {!m.isMe && (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={m.id} />
          <select name="role" defaultValue={m.role} aria-label={t("রোল")} className={cn(fieldClass, "!w-auto min-h-9 py-1")}>
            <option value="agent">{t("এজেন্ট")}</option>
            <option value="admin">{t("অ্যাডমিন")}</option>
          </select>
          <button type="submit" name="intent" value="role" disabled={pending} className={small}>{t("রোল সেট")}</button>
          <button type="submit" name="intent" value="reset" disabled={pending} className={small}>{t("পাসওয়ার্ড রিসেট")}</button>
          <button type="submit" name="intent" value={m.active ? "deactivate" : "activate"} disabled={pending} className={cn(small, m.active && "text-danger")}>
            {m.active ? t("বন্ধ করুন") : t("আবার চালু করুন")}
          </button>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin text-muted" />}
        </form>
      )}
      {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
      {state.ok && !state.temporaryPassword && <p role="status" className="text-sm text-success">{t(state.ok)}</p>}
      {state.temporaryPassword && <TempPassword password={state.temporaryPassword} />}
    </li>
  );
}
