"use client";

import { useActionState, useEffect, useRef } from "react";
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

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm disabled:opacity-50 dark:border-zinc-700";

export function ReplyForm({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(replyAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.okAt) ref.current?.reset();
  }, [state.okAt]);

  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <textarea
        name="text"
        rows={2}
        maxLength={2000}
        required
        disabled={disabled || pending}
        placeholder={disabled ? "এখন উত্তর দেওয়া যাবে না" : "উত্তর লিখুন…"}
        className={inputClass}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter inserts a new line.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
        <button
          type="submit"
          disabled={disabled || pending}
          className="shrink-0 rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "পাঠানো হচ্ছে…" : "পাঠান"}
        </button>
      </div>
    </form>
  );
}

export function NoteForm({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(noteAction, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.okAt) ref.current?.reset();
  }, [state.okAt]);

  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <textarea name="body" rows={2} maxLength={5000} required disabled={pending} placeholder="অভ্যন্তরীণ নোট (গ্রাহক দেখবেন না)" className={inputClass} />
      <div className="flex items-center justify-between gap-3">
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
        <button type="submit" disabled={pending} className="shrink-0 rounded-md border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700">
          নোট যোগ করুন
        </button>
      </div>
    </form>
  );
}
