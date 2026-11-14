"use client";

import { UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn, fieldClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { inboxHref } from "./inbox-href";
import type { InboxParams } from "./page";

type Override = Partial<Record<keyof InboxParams, string | null>>;

const select = cn(fieldClass, "!min-h-9 min-w-0 flex-1 !rounded-lg !py-1 !pl-2 !pr-0 !text-[13px] font-medium");

/**
 * The inbox filters in ONE line: three small dropdowns (channel, assignee, status) and a toggle for
 * "needs a human". Changing one goes straight to the new URL (the open conversation is dropped so the
 * list is shown). The search box above keeps working with the same filters.
 */
export function InboxFilters({ params }: { params: InboxParams }) {
  const { t } = useI18n();
  const router = useRouter();
  const go = (o: Override) => router.push(inboxHref(params, { c: null, ...o }));

  return (
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
  );
}
