"use client";

import { ClipboardPlus } from "lucide-react";
import { useState } from "react";
import { buttonClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { OrderFormModal } from "../orders/order-form";

/** "Add order" in a conversation or on a contact: opens the order popup with the customer filled in. */
export function NewOrderButton({ contactId, contactLabel, conversationId }: { contactId: string; contactLabel: string; conversationId?: string | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "sm")}>
        <ClipboardPlus aria-hidden className="size-4" />
        {t("অর্ডার যোগ")}
      </button>
      <OrderFormModal open={open} onClose={() => setOpen(false)} contact={{ id: contactId, label: contactLabel }} conversationId={conversationId} />
    </>
  );
}
