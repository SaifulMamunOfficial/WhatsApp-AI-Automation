"use client";

import { ClipboardPlus } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { OrderFormModal } from "../orders/order-form";

/** "Add order" in a conversation or on a contact: opens the order popup with the customer filled in. */
export function NewOrderButton({ contactId, contactLabel, conversationId, openCount = 0 }: { contactId: string; contactLabel: string; conversationId?: string | null; openCount?: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("অর্ডার যোগ")} title={t("অর্ডার যোগ")} className={buttonClass("secondary", "sm", "relative !size-9 !px-0")}>
        <ClipboardPlus aria-hidden className="size-4" />
        {openCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-fg">{openCount}</span>
        )}
      </button>
      <OrderFormModal open={open} onClose={() => setOpen(false)} contact={{ id: contactId, label: contactLabel }} conversationId={conversationId} />
    </>
  );
}
