"use client";

import { Plus, Tag as TagIcon, X } from "lucide-react";
import { useActionState } from "react";
import { TagChip, buttonClass, cn, fieldClass } from "@/components/ui";
import { addTagAction, removeTagAction, tagByNameAction, type TagByNameState } from "@/core/contacts/actions";
import { useI18n } from "@/lib/i18n/client";

export interface TagView {
  id: string;
  name: string;
  color: string | null;
}

/** The contact's tags inside the chat: remove one, add an existing one, or type a new one. */
export function TagBar({ contactId, tags, allTags }: { contactId: string; tags: TagView[]; allTags: TagView[] }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<TagByNameState, FormData>(tagByNameAction, {});
  const unused = allTags.filter((a) => !tags.some((x) => x.id === a.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-sm font-medium text-muted">
        <TagIcon aria-hidden className="size-4" />
        {t("ট্যাগ")}
      </span>

      {tags.length === 0 && <span className="text-sm text-muted">{t("কোনো ট্যাগ নেই।")}</span>}
      {tags.map((tag) => (
        <span key={tag.id} className="inline-flex items-center">
          <TagChip name={tag.name} color={tag.color} />
          <form action={removeTagAction}>
            <input type="hidden" name="contactId" value={contactId} />
            <input type="hidden" name="tagId" value={tag.id} />
            <button type="submit" title={t("সরান")} aria-label={t("সরান") + ": " + tag.name} className="inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-soft hover:text-danger">
              <X aria-hidden className="size-3.5" />
            </button>
          </form>
        </span>
      ))}

      {unused.length > 0 && (
        <form action={addTagAction} className="inline-flex items-center gap-1">
          <input type="hidden" name="contactId" value={contactId} />
          <select name="tagId" aria-label={t("ট্যাগ বেছে নিন")} className={cn(fieldClass, "min-h-9 w-auto py-1 text-sm")}>
            {unused.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button type="submit" aria-label={t("যোগ করুন")} title={t("যোগ করুন")} className={buttonClass("secondary", "sm", "!px-2.5")}>
            <Plus aria-hidden className="size-4" />
          </button>
        </form>
      )}

      {/* key: remount after a success so the box empties */}
      <form key={state.okAt ?? 0} action={action} className="inline-flex items-center gap-1">
        <input type="hidden" name="contactId" value={contactId} />
        <input name="name" required maxLength={40} aria-label={t("নতুন ট্যাগ (যেমন: VIP)")} placeholder={t("নতুন ট্যাগ (যেমন: VIP)")} className={cn(fieldClass, "min-h-9 w-40 py-1 text-sm")} />
        <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>{t("ট্যাগ বানিয়ে যোগ করুন")}</button>
      </form>
      {state.error && <span role="alert" className="w-full text-sm text-danger">{t(state.error)}</span>}
    </div>
  );
}
