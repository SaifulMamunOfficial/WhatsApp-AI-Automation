"use client";

import { Tag as TagIcon, X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { TagChip, buttonClass, cn, fieldClass } from "@/components/ui";
import { addTagAction, removeTagAction, tagByNameAction, type TagByNameState } from "@/core/contacts/actions";
import { useI18n } from "@/lib/i18n/client";

export interface TagView {
  id: string;
  name: string;
  color: string | null;
}

function AddTagForm({ contactId, unused, onDone }: { contactId: string; unused: TagView[]; onDone: () => void }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<TagByNameState, FormData>(tagByNameAction, {});
  useEffect(() => {
    if (state.okAt) onDone();
  }, [state.okAt, onDone]);

  return (
    <div className="space-y-5">
      {unused.length > 0 && (
        <form
          action={async (fd) => {
            await addTagAction(fd);
            onDone();
          }}
          className="space-y-2"
        >
          <input type="hidden" name="contactId" value={contactId} />
          <label htmlFor="existing-tag" className="text-sm font-semibold">{t("ট্যাগ বেছে নিন")}</label>
          <div className="flex gap-2">
            <select id="existing-tag" name="tagId" className={cn(fieldClass, "min-w-0 flex-1")}>
              {unused.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button type="submit" className={buttonClass("secondary", "md")}>{t("যোগ করুন")}</button>
          </div>
        </form>
      )}

      <form action={action} className="space-y-2">
        <input type="hidden" name="contactId" value={contactId} />
        <label htmlFor="new-tag" className="text-sm font-semibold">{t("নতুন ট্যাগ (যেমন: VIP)")}</label>
        <div className="flex gap-2">
          <input id="new-tag" name="name" required maxLength={40} autoFocus={unused.length === 0} placeholder={t("নতুন ট্যাগ (যেমন: VIP)")} className={cn(fieldClass, "min-w-0 flex-1")} />
          <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>{t("ট্যাগ বানিয়ে যোগ করুন")}</button>
        </div>
        {state.error && <p role="alert" className="text-sm text-danger">{t(state.error)}</p>}
      </form>
    </div>
  );
}

/** One icon button (with the tag count) that opens a popup: current tags to remove, plus add/create. */
export function TagsButton({ contactId, tags, allTags }: { contactId: string; tags: TagView[]; allTags: TagView[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const unused = allTags.filter((a) => !tags.some((x) => x.id === a.id));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("ট্যাগ")}
        title={tags.length ? tags.map((x) => x.name).join(", ") : t("ট্যাগ যোগ করুন")}
        className={buttonClass("secondary", "sm", "relative !size-9 !px-0")}
      >
        <TagIcon aria-hidden className="size-4" />
        {tags.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-fg">{tags.length}</span>
        )}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t("ট্যাগ")} size="sm">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
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
          </div>
          <AddTagForm contactId={contactId} unused={unused} onDone={() => setOpen(false)} />
        </div>
      </Modal>
    </>
  );
}
