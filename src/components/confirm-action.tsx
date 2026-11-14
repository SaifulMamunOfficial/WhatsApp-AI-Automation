"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Modal } from "./modal";
import { buttonClass, cn } from "./ui";

/**
 * A button that asks "are you sure?" in a popup before running a server action (delete, switch off...).
 * `action` is a Server Action that takes FormData; `fields` are sent as hidden inputs.
 */
export function ConfirmAction({
  action,
  fields,
  title,
  message,
  confirmLabel,
  danger,
  children,
  className,
  ariaLabel,
  tooltip,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  /** What the button shows (text or an icon). */
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  tooltip?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={ariaLabel} title={tooltip ?? ariaLabel} className={className}>
        {children}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} size="sm">
        <form
          action={(fd) =>
            start(async () => {
              await action(fd);
              setOpen(false);
            })
          }
          className="space-y-4"
        >
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <p className="text-sm">{message}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary", "md")}>{t("বাতিল করুন")}</button>
            <button type="submit" disabled={pending} className={cn(buttonClass(danger ? "danger" : "primary", "md"))}>
              {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
