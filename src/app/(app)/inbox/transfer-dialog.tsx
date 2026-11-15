"use client";

import { useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { buttonClass, fieldClass } from "@/components/ui";
import { transferAction, type FormState } from "@/core/inbox/actions";
import { useI18n } from "@/lib/i18n/client";
import { useActionState } from "react";

export function TransferDialog({
  conversationId,
  currentAssigneeId,
  currentAssigneeName,
  users,
  viewerId,
  viewerRole,
}: {
  conversationId: string;
  currentAssigneeId: string | null;
  currentAssigneeName: string | null;
  users: { id: string; name: string; role: "admin" | "agent" }[];
  viewerId: string;
  viewerRole: "admin" | "agent";
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const res = await transferAction(prev, formData);
      if (!res.error) {
        setOpen(false);
      }
      return res;
    },
    {},
  );

  const canTransfer = viewerRole === "admin" || currentAssigneeId === viewerId;

  if (!canTransfer) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClass("secondary", "sm", "gap-1.5")}
        title={t("অন্য এজেন্টের কাছে চ্যাট হস্তান্তর করুন")}
      >
        <ArrowRightLeft aria-hidden className="size-3.5" />
        <span>{t("ট্রান্সফার")}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("চ্যাট ট্রান্সফার")} size="md">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="conversationId" value={conversationId} />

          {state.error && (
            <div role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {t(state.error)}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted">
              {t("বর্তমান দায়িত্বে")}
            </label>
            <p className="text-sm font-medium">
              {currentAssigneeName || t("দায়িত্বে কেউ নেই")}
            </p>
          </div>

          <div>
            <label htmlFor="toUserId" className="mb-1.5 block text-xs font-semibold text-muted">
              {t("নতুন এজেন্টের কাছে পাঠান")}
            </label>
            <select
              id="toUserId"
              name="toUserId"
              defaultValue=""
              required
              className={fieldClass}
            >
              <option value="" disabled>
                {t("এজেন্ট বেছে নিন…")}
              </option>
              {users
                .filter((u) => u.id !== currentAssigneeId)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === "admin" ? t("অ্যাডমিন") : t("এজেন্ট")})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label htmlFor="transferNote" className="mb-1.5 block text-xs font-semibold text-muted">
              {t("হস্তান্তরের কারণ বা নোট (অভ্যন্তরীণ)")}
            </label>
            <textarea
              id="transferNote"
              name="note"
              rows={3}
              maxLength={1000}
              placeholder={t("গ্রাহকের কী দরকার বা কেন ট্রান্সফার করছেন লিখুন…")}
              className={`${fieldClass} resize-none`}
            />
          </div>

          <p className="text-xs text-muted">
            {t("ট্রান্সফারের সাথে সাথে স্বয়ংক্রিয় বট বন্ধ হবে যাতে নতুন এজেন্ট কাজ শুরু করতে পারে।")}
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className={buttonClass("secondary", "md")}
            >
              {t("বাতিল")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className={buttonClass("primary", "md", "gap-1.5")}
            >
              {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
              {t("ট্রান্সফার নিশ্চিত করুন")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
