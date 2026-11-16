"use client";

import { ChevronDown, UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn, fieldClass } from "@/components/ui";
import { assignAction } from "@/core/inbox/actions";
import { useI18n } from "@/lib/i18n/client";

/**
 * The toolbar of a conversation (stage, assignee, order, transfer, tags). Always shown on wide screens;
 * on a phone it sits behind a "Details" toggle so the messages keep the screen. On a wide pane it joins
 * the first row; on a narrower one it drops to its own row (container query on the header).
 */
export function HeaderDetails({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="order-3 w-full @4xl:order-2 @4xl:w-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-9 w-full items-center justify-between rounded-lg px-1 text-sm font-semibold text-muted md:hidden"
      >
        {t("বিস্তারিত ও অ্যাকশন")}
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <div className={cn("flex-wrap items-center gap-2 pt-2 md:flex md:pt-0", open ? "flex" : "hidden")}>{children}</div>
    </div>
  );
}

/** Pick who owns the conversation. It applies as soon as you choose, so there is no separate Set button. */
export function AssignSelect({
  conversationId,
  current,
  currentName,
  options,
}: {
  conversationId: string;
  current: string | null;
  currentName: string | null;
  options: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  return (
    // key: React resets the form after the action, so remount to show the new server value
    <form key={current ?? "none"} action={assignAction} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="conversationId" value={conversationId} />
      <UserRound aria-hidden className="size-4 shrink-0 text-muted" />
      <label htmlFor="assign" className="sr-only">{t("দায়িত্বে কে")}</label>
      <select
        id="assign"
        name="userId"
        defaultValue={current ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cn(fieldClass, "!h-9 !min-h-0 w-auto max-w-44 !py-0 !pl-2.5 !pr-7 !text-[13px] font-semibold")}
      >
        <option value="">{t("দায়িত্বে কেউ নেই")}</option>
        {options.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
        {current && !options.some((u) => u.id === current) && <option value={current}>{currentName}</option>}
      </select>
    </form>
  );
}
