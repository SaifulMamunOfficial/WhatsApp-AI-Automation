"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { fieldClass } from "@/components/ui";
import { updateContactStageAction } from "@/core/contacts/actions";
import type { LifecycleStage } from "@/core/contacts/stages";
import { useI18n } from "@/lib/i18n/client";

export function StageSelector({
  contactId,
  currentStageId,
  stages,
}: {
  contactId: string;
  currentStageId: string | null;
  stages: LifecycleStage[];
}) {
  const { t } = useI18n();
  const [isPending, startTransition] = useTransition();

  function handleChange(newStageId: string) {
    const formData = new FormData();
    formData.set("contactId", contactId);
    formData.set("stageId", newStageId);

    startTransition(async () => {
      await updateContactStageAction(formData);
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={`stage-select-${contactId}`} className="sr-only">
        {t("লাইফসাইকেল স্টেজ")}
      </label>
      <div className="relative inline-flex items-center">
        <select
          id={`stage-select-${contactId}`}
          defaultValue={currentStageId ?? ""}
          disabled={isPending}
          onChange={(e) => handleChange(e.target.value)}
          aria-label={t("লাইফসাইকেল স্টেজ পরিবর্তন")}
          className={`${fieldClass} !h-8 !min-h-0 !py-0.5 !pl-2.5 !pr-7 !text-xs font-semibold`}
        >
          <option value="">{t("স্টেজ নেই")}</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.isDefault ? " (" + t("ডিফল্ট") + ")" : ""}
            </option>
          ))}
        </select>
        {isPending && (
          <span className="pointer-events-none absolute right-2 text-muted">
            <Loader2 aria-hidden className="size-3 animate-spin" />
          </span>
        )}
      </div>
    </div>
  );
}
