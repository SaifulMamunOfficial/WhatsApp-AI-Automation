"use client";

import { ImagePlus, Loader2, SendHorizontal, StickyNote, X } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { buttonClass, fieldClass } from "@/components/ui";
import { matchQuickReplies, slashQuery, type QuickReply } from "@/core/inbox/quick-reply-match";
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

export function ReplyForm({ conversationId, disabled, quickReplies = [] }: { conversationId: string; disabled: boolean; quickReplies?: QuickReply[] }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<FormState, FormData>(replyAction, {});
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const listId = useId();

  // A successful send clears the box. (Adjusting state while rendering, not in an effect: React's
  // recommended way to reset state when a value changes.)
  const [clearedFor, setClearedFor] = useState(0);
  const [picture, setPicture] = useState<{ name: string; problem: string | null } | null>(null);
  if (state.okAt && state.okAt !== clearedFor) {
    setClearedFor(state.okAt);
    setText("");
    setPicture(null);
  }
  const fileRef = useRef<HTMLInputElement>(null);

  // Typing "/" first (and no space yet) opens the saved-replies menu.
  const query = slashQuery(text);
  const slash = query !== null && !dismissed && quickReplies.length > 0;
  const matches = slash ? matchQuickReplies(quickReplies, query) : [];
  const menuOpen = slash && matches.length > 0;
  const current = Math.min(active, Math.max(0, matches.length - 1));

  function insert(r: QuickReply) {
    setText(r.body);
    setDismissed(true);
    requestAnimationFrame(() => areaRef.current?.focus());
  }

  return (
    <form action={action} className="relative space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      {menuOpen && (
        <ul id={listId} role="listbox" aria-label={t("দ্রুত উত্তর")} className="scroll-thin absolute inset-x-0 bottom-full z-10 mb-2 max-h-60 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop">
          {matches.map((r, i) => (
            <li key={r.id} id={`${listId}-${i}`} role="option" aria-selected={i === current}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(r);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-baseline gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === current ? "bg-brand-soft" : "hover:bg-surface-2"}`}
              >
                <span className="shrink-0 font-mono font-semibold text-brand">/{r.shortcut}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{r.body}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {picture && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <ImagePlus aria-hidden className="size-4 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate font-medium">{picture.name}</span>
          {picture.problem && <span role="alert" className="text-danger">{t(picture.problem)}</span>}
          <button
            type="button"
            aria-label={t("ছবি সরান")}
            title={t("ছবি সরান")}
            onClick={() => {
              if (fileRef.current) fileRef.current.value = "";
              setPicture(null);
            }}
            className="inline-flex size-8 items-center justify-center rounded-full text-muted hover:bg-danger-soft hover:text-danger"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        {/* key: choosing again after a send starts from an empty file box */}
        <input
          key={clearedFor}
          ref={fileRef}
          type="file"
          name="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          disabled={disabled || pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return setPicture(null);
            const problem = f.type !== "image/jpeg" && f.type !== "image/png" ? "শুধু JPEG বা PNG ছবি পাঠানো যায়।" : f.size > 5 * 1024 * 1024 ? "ছবি ৫ MB-এর বেশি হতে পারবে না।" : null;
            setPicture({ name: f.name, problem });
          }}
        />
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => fileRef.current?.click()}
          aria-label={t("ছবি জুড়ুন")}
          title={t("ছবি জুড়ুন")}
          className={buttonClass("secondary", "md", "size-11 shrink-0 !px-0")}
        >
          <ImagePlus aria-hidden className="size-4" />
        </button>
        <textarea
          ref={areaRef}
          name="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setDismissed(false);
          }}
          role="combobox"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? listId : undefined}
          aria-activedescendant={menuOpen ? `${listId}-${current}` : undefined}
          aria-autocomplete="list"
          rows={2}
          maxLength={2000}
          required={!picture}
          disabled={disabled || pending}
          aria-label={t("উত্তর লিখুন")}
          placeholder={disabled ? t("এখন উত্তর দেওয়া যাবে না") : quickReplies.length > 0 ? t("উত্তর লিখুন… (Enter পাঠায়, Shift+Enter নতুন লাইন, / দিয়ে দ্রুত উত্তর)") : t("উত্তর লিখুন… (Enter পাঠায়, Shift+Enter নতুন লাইন)")}
          className={`${fieldClass} resize-none`}
          onKeyDown={(e) => {
            if (menuOpen) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((current + 1) % matches.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((current - 1 + matches.length) % matches.length);
                return;
              }
              if ((e.key === "Enter" || e.key === "Tab") && !e.nativeEvent.isComposing) {
                e.preventDefault();
                insert(matches[current]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDismissed(true);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" disabled={disabled || pending || !!picture?.problem} aria-label={t("পাঠান")} className={buttonClass("primary", "md", "size-11 shrink-0 !px-0")}>
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
