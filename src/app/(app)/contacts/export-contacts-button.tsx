"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { Alert, Field, buttonClass, fieldClass } from "@/components/ui";
import { exportContactsCsvAction } from "@/core/contacts/actions";
import type { LifecycleStage } from "@/core/contacts/stages";
import { useI18n } from "@/lib/i18n/client";

export function ExportContactsButton({
  stages = [],
  currentFilters = {},
}: {
  stages?: LifecycleStage[];
  currentFilters?: { q?: string; stageId?: string };
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [stageId, setStageId] = useState<string>(currentFilters.stageId ?? "");
  const [optedInOnly, setOptedInOnly] = useState<boolean>(false);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleExport(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await exportContactsCsvAction({
        search: currentFilters.q,
        stageId: stageId || undefined,
        optedIn: optedInOnly ? true : undefined,
        fromLastContactDate: fromDate || undefined,
        toLastContactDate: toDate || undefined,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      // Download CSV file
      const blob = new Blob([res.csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `contacts-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass("secondary", "md", "gap-1.5")}
        title={t("কন্টাক্ট তালিকা CSV ফরম্যাটে নামান")}
      >
        <Download aria-hidden className="size-4" />
        <span>{t("CSV এক্সপোর্ট")}</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("কন্টাক্ট CSV এক্সপোর্ট")}
        size="md"
      >
        <form onSubmit={handleExport} className="space-y-4">
          {error && <Alert tone="danger">{t(error)}</Alert>}

          <p className="text-sm text-muted">
            {t("ফিল্টার অনুযায়ী কন্টাক্ট ডেটা নিরাপদ CSV ফাইলে এক্সপোর্ট করুন। Excel-এ বাংলা ফন্ট অক্ষত রাখতে UTF-8 BOM অন্তর্ভুক্ত থাকবে।")}
          </p>

          <Field label={t("লাইফসাইকেল স্টেজ")}>
            <select
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
              className={fieldClass}
            >
              <option value="">{t("সব স্টেজ")}</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isDefault ? " (" + t("ডিফল্ট") + ")" : ""}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("শেষ যোগাযোগ শুরুর তারিখ")}>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={fieldClass}
              />
            </Field>
            <Field label={t("শেষ যোগাযোগ সমাপ্তির তারিখ")}>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={fieldClass}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={optedInOnly}
              onChange={(e) => setOptedInOnly(e.target.checked)}
              className="size-4 rounded border-border text-brand focus:ring-brand"
            />
            <span>{t("শুধুমাত্র মার্কেটিং মেসেজে সম্মতিপ্রাপ্ত (Opted-in only)")}</span>
          </label>

          <div className="rounded-xl border border-border bg-surface-2 p-3 text-xs text-muted space-y-1">
            <p>• {t("OWASP Formula Injection প্রতিরোধে ক্ষতিকর কোড স্যানিটাইজ করা হবে।")}</p>
            <p>• {t("একবারে সর্বোচ্চ ৫,০০০ কন্টাক্ট এক্সপোর্ট করা যাবে।")}</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className={buttonClass("secondary", "md")}
            >
              {t("বাতিল করুন")}
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={buttonClass("primary", "md", "gap-1.5")}
            >
              {isPending && <Loader2 aria-hidden className="size-4 animate-spin" />}
              {t("এক্সপোর্ট ডাউনলোড")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
