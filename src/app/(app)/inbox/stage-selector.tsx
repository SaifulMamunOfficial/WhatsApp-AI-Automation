"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { STAGE_COLOR_MAP } from "@/components/stage-pill";
import { cn, fieldClass } from "@/components/ui";
import { updateContactStageAction } from "@/core/contacts/actions";
import type { LifecycleStage } from "@/core/contacts/stages";
import { useI18n } from "@/lib/i18n/client";

/** The customer's lifecycle stage as a colored dropdown: the color of the chosen stage fills it. */
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
  const [value, setValue] = useState(currentStageId ?? "");
  const [synced, setSynced] = useState(currentStageId);
  // Follow the server value when it changes (another tab, another person).
  if (synced !== currentStageId) {
    setSynced(currentStageId);
    setValue(currentStageId ?? "");
  }
  const chosen = stages.find((s) => s.id === value);
  const color = chosen ? (STAGE_COLOR_MAP[chosen.colorKey] ?? STAGE_COLOR_MAP.slate) : null;

  function handleChange(newStageId: string) {
    setValue(newStageId);
    const formData = new FormData();
    formData.set("contactId", contactId);
    formData.set("stageId", newStageId);
    startTransition(async () => {
      await updateContactStageAction(formData);
    });
  }

  return (
    <div className="relative inline-flex items-center">
      <label htmlFor={`stage-select-${contactId}`} className="sr-only">{t("লাইফসাইকেল স্টেজ")}</label>
      <select
        id={`stage-select-${contactId}`}
        value={value}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        aria-label={t("লাইফসাইকেল স্টেজ পরিবর্তন")}
        className={cn(fieldClass, "!h-9 !min-h-0 max-w-44 !py-0 !pl-2.5 !pr-7 !text-[13px] font-semibold", color?.bg)}
      >
        <option value="">{t("স্টেজ নেই")}</option>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} {s.isDefault ? " (" + t("ডিফল্ট") + ")" : ""}
          </option>
        ))}
      </select>
      {isPending && (
        <span className="pointer-events-none absolute right-7 text-muted">
          <Loader2 aria-hidden className="size-3 animate-spin" />
        </span>
      )}
    </div>
  );
}
