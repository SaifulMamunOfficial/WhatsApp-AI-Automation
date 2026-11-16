"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { buttonClass } from "@/components/ui";
import type { LifecycleStage } from "@/core/contacts/stages";
import { useI18n } from "@/lib/i18n/client";
import { InboxFilters } from "./inbox-filters";
import type { InboxParams } from "./page";

/**
 * On a phone the filters do not sit above the list (they would push the first conversation far down the
 * screen). One button, with a count of the active ones, opens them in a popup instead.
 */
export function FiltersSheet({ params, stages, unrepliedCount }: { params: InboxParams; stages: LifecycleStage[]; unrepliedCount: number }) {
  const { t, num } = useI18n();
  const [open, setOpen] = useState(false);
  const active = [
    !!params.channel,
    params.assigned !== "all",
    params.status !== "open",
    !!params.unreplied,
    !!params.needs,
    !!params.stage,
  ].filter(Boolean).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("ফিল্টার")}
        title={t("ফিল্টার")}
        className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface text-fg transition-colors hover:bg-surface-2"
      >
        <SlidersHorizontal aria-hidden className="size-5" />
        {active > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-brand-fg">{num(active)}</span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("ফিল্টার")} size="sm">
        <div className="space-y-4">
          <InboxFilters params={params} stages={stages} unrepliedCount={unrepliedCount} />
          <button type="button" onClick={() => setOpen(false)} className={buttonClass("primary", "md", "w-full")}>{t("ফলাফল দেখুন")}</button>
        </div>
      </Modal>
    </>
  );
}
