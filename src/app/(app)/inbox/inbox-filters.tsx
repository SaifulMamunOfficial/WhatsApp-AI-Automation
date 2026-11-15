"use client";

import { Clock, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn, fieldClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import type { LifecycleStage } from "@/core/contacts/stages";
import { inboxHref } from "./inbox-href";
import type { InboxParams } from "./page";

type Override = Partial<Record<keyof InboxParams, string | null>>;

const select = cn(fieldClass, "!min-h-9 min-w-0 flex-1 !rounded-lg !py-1 !pl-2 !pr-0 !text-[13px] font-medium");

export function InboxFilters({
  params,
  unrepliedCount = 0,
  stages = [],
}: {
  params: InboxParams;
  unrepliedCount?: number;
  stages?: LifecycleStage[];
}) {
  const { t, num } = useI18n();
  const router = useRouter();
  const go = (o: Override) => router.push(inboxHref(params, { c: null, ...o }));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select aria-label={t("চ্যানেল")} value={params.channel ?? ""} onChange={(e) => go({ channel: e.target.value || null })} className={cn(select, "flex-[1.35]")}>
          <option value="">{t("সব চ্যানেল")}</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="messenger">Messenger</option>
        </select>

        <select aria-label={t("দায়িত্ব")} value={params.assigned} onChange={(e) => go({ assigned: e.target.value })} className={select}>
          <option value="all">{t("সবার")}</option>
          <option value="me">{t("আমার")}</option>
          <option value="unassigned">{t("অনির্ধারিত")}</option>
        </select>

        <select aria-label={t("অবস্থা")} value={params.status} onChange={(e) => go({ status: e.target.value })} className={select}>
          <option value="open">{t("খোলা")}</option>
          <option value="closed">{t("বন্ধ")}</option>
          <option value="all">{t("সব অবস্থা")}</option>
        </select>

        <button
          type="button"
          aria-pressed={!!params.unreplied}
          aria-label={t("উত্তর-না-পাওয়া")}
          title={t("উত্তর-না-পাওয়া")}
          onClick={() => go({ unreplied: params.unreplied ? null : "1" })}
          className={cn(
            "relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
            params.unreplied ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400" : "border-border-strong bg-surface text-muted hover:text-fg",
          )}
        >
          <Clock aria-hidden className="size-4" />
          {unrepliedCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
              {num(unrepliedCount)}
            </span>
          )}
        </button>

        <button
          type="button"
          aria-pressed={!!params.needs}
          aria-label={t("মানুষ দরকার")}
          title={t("মানুষ দরকার")}
          onClick={() => go({ needs: params.needs ? null : "1" })}
          className={cn(
            "inline-flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
            params.needs ? "border-danger/40 bg-danger-soft text-danger" : "border-border-strong bg-surface text-muted hover:text-fg",
          )}
        >
          <UserRound aria-hidden className="size-4" />
        </button>
      </div>

      {stages.length > 0 && (
        <div className="flex items-center">
          <select
            aria-label={t("লাইফসাইকেল স্টেজ")}
            value={params.stage ?? ""}
            onChange={(e) => go({ stage: e.target.value || null })}
            className={cn(select, "!w-full")}
          >
            <option value="">{t("সব স্টেজ")}</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.isDefault ? " (" + t("ডিফল্ট") + ")" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
