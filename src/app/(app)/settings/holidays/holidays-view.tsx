"use client";

import { CalendarCheck, CalendarClock, CalendarOff, CalendarPlus, History, Loader2, Pencil, Power, Search, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { Modal } from "@/components/modal";
import { Alert, Badge, Card, EmptyState, Field, StatCard, buttonClass, cn, fieldClass } from "@/components/ui";
import { addHolidayAction, toggleHolidayAction, updateHolidayAction, deleteHolidayAction, type HolidayFormState } from "@/core/automation/holiday-actions";
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
  days: number;
}

function HolidayForm({ holiday, onClose }: { holiday?: HolidayView; onClose: () => void }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<HolidayFormState, FormData>(holiday ? updateHolidayAction : addHolidayAction, {});
  useEffect(() => {
    if (state.okAt) onClose();
  }, [state.okAt, onClose]);

  return (
    <form action={action} className="space-y-3">
      {holiday && <input type="hidden" name="id" value={holiday.id} />}
      <Field label={t("ছুটির নাম")}>
        <input name="name" required maxLength={100} autoFocus defaultValue={holiday?.name} placeholder={t("যেমন: ঈদুল ফিতর")} className={fieldClass} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("শুরুর তারিখ")}>
          <input name="startDate" type="date" required defaultValue={holiday?.startDate} className={fieldClass} />
        </Field>
        <Field label={t("শেষের তারিখ (এই দিনসহ)")}>
          <input name="endDate" type="date" required defaultValue={holiday?.endDate} className={fieldClass} />
        </Field>
      </div>
      <Field label={t("গ্রাহককে যে বার্তা যাবে")}>
        <textarea name="text" required rows={4} maxLength={1000} defaultValue={holiday?.text} placeholder={t("যেমন: ঈদের ছুটি চলছে। ২৩ মার্চ থেকে আমরা আবার খোলা।")} className={fieldClass} />
      </Field>
      {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>{t("বাতিল করুন")}</button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {holiday ? t("হালনাগাদ") : t("ছুটি যোগ করুন")}
        </button>
      </div>
    </form>
  );
}

export function HolidaysView({ holidays }: { holidays: HolidayView[] }) {
  const { t, num } = useI18n();
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<"" | HolidayView["phase"]>("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<HolidayView | null>(null);

  const stats = {
    total: holidays.length,
    active: holidays.filter((h) => h.phase === "active" && h.enabled).length,
    upcoming: holidays.filter((h) => h.phase === "upcoming").length,
    past: holidays.filter((h) => h.phase === "past").length,
  };
  const q = query.trim().toLowerCase();
  const shown = holidays.filter((h) => (!q || h.name.toLowerCase().includes(q) || h.text.toLowerCase().includes(q)) && (!phase || h.phase === phase));
  const iconBtn = "inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

  return (
    <div className="space-y-6">
      {stats.active > 0 && <Alert tone="warning">{t("এখন ছুটি চলছে: {name}। গ্রাহকরা ছুটির বার্তা পাচ্ছেন (bot চালু থাকলে)।", { name: holidays.find((h) => h.phase === "active" && h.enabled)?.name ?? "" })}</Alert>}

      <section aria-label={t("মূল সংখ্যা")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<CalendarOff className="size-5" />} label={t("মোট ছুটি")} value={num(stats.total)} />
        <StatCard icon={<CalendarCheck className="size-5" />} label={t("এখন চলছে")} value={num(stats.active)} tone={stats.active > 0 ? "warning" : undefined} />
        <StatCard icon={<CalendarClock className="size-5" />} label={t("আসছে")} value={num(stats.upcoming)} />
        <StatCard icon={<History className="size-5" />} label={t("শেষ")} value={num(stats.past)} />
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:p-4">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("ছুটি খুঁজুন")} placeholder={t("ছুটি খুঁজুন")} className={cn(fieldClass, "!min-h-10 pl-10")} />
          </div>
          <select value={phase} onChange={(e) => setPhase(e.target.value as typeof phase)} aria-label={t("অবস্থা")} className={cn(fieldClass, "!min-h-10 !w-auto")}>
            <option value="">{t("সব ছুটি")}</option>
            <option value="active">{t("এখন চলছে")}</option>
            <option value="upcoming">{t("আসছে")}</option>
            <option value="past">{t("শেষ")}</option>
          </select>
          <button type="button" onClick={() => setAdding(true)} className={cn(buttonClass("primary", "md"), "sm:ml-auto")}>
            <CalendarPlus aria-hidden className="size-4" />
            {t("নতুন ছুটি")}
          </button>
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={<CalendarOff aria-hidden className="size-8" />} title={holidays.length === 0 ? t("এখনো কোনো ছুটি নেই।") : t("কোনো ছুটি মেলেনি।")} hint={holidays.length === 0 ? t("উপরে প্রথমটা যোগ করুন, যেমন ঈদের ছুটি।") : undefined} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-surface-2/60 text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">{t("ছুটি")}</th>
                  <th scope="col" className="px-4 py-3">{t("তারিখ")}</th>
                  <th scope="col" className="px-4 py-3">{t("সময়কাল")}</th>
                  <th scope="col" className="px-4 py-3">{t("অবস্থা")}</th>
                  <th scope="col" className="px-4 py-3">{t("বার্তা")}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t("কাজ")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((h) => (
                  <tr key={h.id} className={cn("transition-colors hover:bg-surface-2/40", (!h.enabled || h.phase === "past") && "opacity-70")}>
                    <td className="px-4 py-3 font-semibold">{h.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{h.range}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{t("{n} দিন", { n: num(h.days) })}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {h.phase === "active" && <Badge tone="success">{t("এখন চলছে")}</Badge>}
                        {h.phase === "upcoming" && <Badge tone="info">{t("আসছে")}</Badge>}
                        {h.phase === "past" && <Badge>{t("শেষ")}</Badge>}
                        {!h.enabled && <Badge tone="warning">{t("বন্ধ করা")}</Badge>}
                      </div>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-muted"><p className="line-clamp-2" title={h.text}>{h.text}</p></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-0.5">
                        <button type="button" className={iconBtn} title={t("সম্পাদনা")} aria-label={t("সম্পাদনা") + ": " + h.name} onClick={() => setEditing(h)}>
                          <Pencil aria-hidden className="size-[18px]" />
                        </button>
                        <ConfirmAction
                          action={toggleHolidayAction}
                          fields={{ id: h.id, enabled: String(!h.enabled) }}
                          title={h.enabled ? t("ছুটি বন্ধ করুন") : t("ছুটি চালু করুন")}
                          message={h.enabled ? t("“{name}” ছুটির বার্তা আর যাবে না। বন্ধ করবেন?", { name: h.name }) : t("“{name}” ছুটির বার্তা আবার যাবে। চালু করবেন?", { name: h.name })}
                          confirmLabel={t("নিশ্চিত করুন")}
                          className={iconBtn}
                          ariaLabel={(h.enabled ? t("বন্ধ করুন") : t("চালু করুন")) + ": " + h.name}
                        >
                          <Power aria-hidden className="size-[18px]" />
                        </ConfirmAction>
                        <ConfirmAction
                          action={deleteHolidayAction}
                          fields={{ id: h.id }}
                          title={t("ছুটি মুছুন")}
                          message={t("“{name}” ছুটিটা মুছে ফেলবেন? এটা ফেরানো যায় না।", { name: h.name })}
                          confirmLabel={t("মুছুন")}
                          danger
                          className={cn(iconBtn, "hover:bg-danger-soft hover:text-danger")}
                          ariaLabel={t("মুছুন") + ": " + h.name}
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
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted">{t("{n}টির মধ্যে {m}টি দেখানো হচ্ছে", { n: num(holidays.length), m: num(shown.length) })}</div>
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title={t("নতুন ছুটি")}>
        {adding && <HolidayForm onClose={() => setAdding(false)} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t("ছুটি সম্পাদনা")}>
        {editing && <HolidayForm key={editing.id} holiday={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
