"use client";

import { Loader2, SendHorizontal, StickyNote } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { buttonClass, fieldClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/client";
import { markReadAction, noteAction, replyAction } from "@/core/inbox/actions";
import type { FormState } from "@/core/inbox/actions";

/** Keeps the newest message in view when the thread opens or grows. */
export function ScrollToBottom({ trigger }: { trigger: number | string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [trigger]);
  return <div ref={ref} />;
}

/** Marks the conversation read once it is on screen. Rendered only while unread > 0. */
export function MarkRead({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    void markReadAction(conversationId);
  }, [conversationId]);
  return null;
}

export function ReplyForm({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<FormState, FormData>(replyAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.okAt) ref.current?.reset();
  }, [state.okAt]);

  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex items-end gap-2">
        <textarea
          name="text"
          rows={2}
          maxLength={2000}
          required
          disabled={disabled || pending}
          aria-label={t("উত্তর লিখুন")}
          placeholder={disabled ? t("এখন উত্তর দেওয়া যাবে না") : t("উত্তর লিখুন… (Enter পাঠায়, Shift+Enter নতুন লাইন)")}
          className={`${fieldClass} resize-none`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" disabled={disabled || pending} aria-label={t("পাঠান")} className={buttonClass("primary", "md", "size-11 shrink-0 !px-0")}>
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <SendHorizontal aria-hidden className="size-4" />}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {t(state.error)}
        </p>
      )}
    </form>
  );
}

export function NoteForm({ conversationId }: { conversationId: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<FormState, FormData>(noteAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.okAt) ref.current?.reset();
  }, [state.okAt]);

  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <textarea name="body" rows={2} maxLength={5000} required disabled={pending} aria-label={t("নতুন নোট")} placeholder={t("অভ্যন্তরীণ নোট (গ্রাহক দেখবেন না)")} className={`${fieldClass} resize-none`} />
      <div className="flex items-center justify-between gap-3">
        <p role="alert" className="text-sm text-danger">
          {state.error && t(state.error)}
        </p>
        <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>
          <StickyNote aria-hidden className="size-4" />
          {t("নোট যোগ করুন")}
        </button>
      </div>
    </form>
  );
}
