"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Alert, Badge, Card, Field, buttonClass, cn, fieldClass } from "@/components/ui";
import { addHolidayAction, deleteHolidayAction, toggleHolidayAction, updateHolidayAction, type HolidayFormState } from "@/core/automation/holiday-actions";
import { useI18n } from "@/lib/i18n/client";

export interface HolidayView {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  text: string;
  enabled: boolean;
  /** "active" now, "upcoming", or "past" (decided on the server in the office time zone). */
  phase: "active" | "upcoming" | "past";
  range: string;
}

function Fields({ h }: { h?: HolidayView }) {
  const { t } = useI18n();
  return (
    <>
      <Field label={t("ছুটির নাম")}>
        <input name="name" required maxLength={100} defaultValue={h?.name} placeholder={t("যেমন: ঈদুল ফিতর")} className={fieldClass} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("শুরুর তারিখ")}>
          <input name="startDate" type="date" required defaultValue={h?.startDate} className={fieldClass} />
        </Field>
        <Field label={t("শেষের তারিখ (এই দিনসহ)")}>
          <input name="endDate" type="date" required defaultValue={h?.endDate} className={fieldClass} />
        </Field>
      </div>
      <Field label={t("গ্রাহককে যে বার্তা যাবে")}>
        <textarea name="text" required rows={3} maxLength={1000} defaultValue={h?.text} placeholder={t("যেমন: ঈদের ছুটি চলছে। ২৩ মার্চ থেকে আমরা আবার খোলা।")} className={fieldClass} />
      </Field>
    </>
  );
}

export function AddHolidayForm() {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<HolidayFormState, FormData>(addHolidayAction, {});
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <h2 className="text-base font-bold">{t("নতুন ছুটি")}</h2>
      {/* key: remount after a success so the fields empty */}
      <form key={state.okAt ?? 0} action={action} className="space-y-3">
        <Fields />
        {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {t("ছুটি যোগ করুন")}
        </button>
      </form>
    </Card>
  );
}

export function HolidayRow({ h }: { h: HolidayView }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<HolidayFormState, FormData>(updateHolidayAction, {});
  return (
    <li className={cn("space-y-3 px-4 py-4", (!h.enabled || h.phase === "past") && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{h.name}</p>
        <span className="text-sm text-muted">{h.range}</span>
        {h.phase === "active" && <Badge tone="success">{t("এখন চলছে")}</Badge>}
        {h.phase === "upcoming" && <Badge tone="info">{t("আসছে")}</Badge>}
        {h.phase === "past" && <Badge>{t("শেষ")}</Badge>}
        {!h.enabled && <Badge tone="warning">{t("বন্ধ করা")}</Badge>}
      </div>
      <details className="rounded-xl border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-brand">{t("সম্পাদনা")}</summary>
        <form action={action} className="space-y-3 border-t border-border p-3">
          <input type="hidden" name="id" value={h.id} />
          <Fields h={h} />
          {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>
              {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
              {t("হালনাগাদ")}
            </button>
            {state.okAt && !state.error && <span role="status" className="text-sm text-success">{t("সেভ হয়েছে।")}</span>}
          </div>
        </form>
      </details>
      <p className="whitespace-pre-wrap text-sm text-muted">{h.text}</p>
      <div className="flex flex-wrap gap-2">
        <form action={toggleHolidayAction}>
          <input type="hidden" name="id" value={h.id} />
          <input type="hidden" name="enabled" value={String(!h.enabled)} />
          <button type="submit" className={buttonClass("secondary", "sm")}>{h.enabled ? t("বন্ধ করুন") : t("চালু করুন")}</button>
        </form>
        <form action={deleteHolidayAction}>
          <input type="hidden" name="id" value={h.id} />
          <button type="submit" className={buttonClass("secondary", "sm", "text-danger")}>{t("মুছুন")}</button>
        </form>
      </div>
    </li>
  );
}
