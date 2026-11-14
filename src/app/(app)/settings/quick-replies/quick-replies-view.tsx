"use client";

import { Loader2, MessageSquareText, Pencil, Plus, Search, Trash2, Zap } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { Modal } from "@/components/modal";
import { Alert, Card, EmptyState, Field, StatCard, buttonClass, cn, fieldClass } from "@/components/ui";
import { addQuickReplyAction, deleteQuickReplyAction, updateQuickReplyAction, type QuickReplyFormState } from "@/core/inbox/quick-reply-actions";
import type { QuickReply } from "@/core/inbox/quick-reply-match";
import { useI18n } from "@/lib/i18n/client";

const MAX = 200;

function ReplyForm({ reply, onClose }: { reply?: QuickReply; onClose: () => void }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<QuickReplyFormState, FormData>(reply ? updateQuickReplyAction : addQuickReplyAction, {});
  useEffect(() => {
    if (state.okAt) onClose();
  }, [state.okAt, onClose]);

  return (
    <form action={action} className="space-y-3">
      {reply && <input type="hidden" name="id" value={reply.id} />}
      <Field label={t("শর্টকাট")} hint={t("ছোট হাতের ইংরেজি অক্ষর, সংখ্যা, - বা _ (যেমন office)। ইনবক্সে / লিখে এটা পাবেন।")}>
        <div className="flex items-center gap-2">
          <span aria-hidden className="font-mono text-lg font-semibold text-brand">/</span>
          <input name="shortcut" required maxLength={31} autoFocus autoComplete="off" spellCheck={false} defaultValue={reply?.shortcut} placeholder="office" className={cn(fieldClass, "font-mono")} />
        </div>
      </Field>
      <Field label={t("উত্তরের লেখা")}>
        <textarea name="body" required rows={5} maxLength={2000} defaultValue={reply?.body} className={fieldClass} />
      </Field>
      {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>{t("বাতিল করুন")}</button>
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {reply ? t("হালনাগাদ") : t("যোগ করুন")}
        </button>
      </div>
    </form>
  );
}

export function QuickRepliesView({ replies }: { replies: QuickReply[] }) {
  const { t, num } = useI18n();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<QuickReply | null>(null);

  const q = query.trim().toLowerCase().replace(/^\//, "");
  const shown = replies.filter((r) => !q || r.shortcut.includes(q) || r.body.toLowerCase().includes(q));
  const iconBtn = "inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg";

  return (
    <div className="space-y-6">
      <section aria-label={t("মূল সংখ্যা")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<MessageSquareText className="size-5" />} label={t("মোট দ্রুত উত্তর")} value={num(replies.length)} />
        <StatCard icon={<Plus className="size-5" />} label={t("আরও রাখা যাবে")} value={num(Math.max(0, MAX - replies.length))} hint={t("সর্বোচ্চ {n}টি", { n: num(MAX) })} />
        <StatCard icon={<Zap className="size-5" />} label={t("সবচেয়ে বড় উত্তর")} value={num(replies.reduce((m, r) => Math.max(m, r.body.length), 0))} hint={t("অক্ষর")} />
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3 sm:p-4">
          <div className="relative min-w-48 flex-1 sm:max-w-sm">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t("শর্টকাট বা লেখা খুঁজুন")} placeholder={t("শর্টকাট বা লেখা খুঁজুন")} className={cn(fieldClass, "!min-h-10 pl-10")} />
          </div>
          <button type="button" onClick={() => setAdding(true)} className={cn(buttonClass("primary", "md"), "sm:ml-auto")}>
            <Plus aria-hidden className="size-4" />
            {t("নতুন দ্রুত উত্তর")}
          </button>
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={<MessageSquareText aria-hidden className="size-8" />} title={replies.length === 0 ? t("এখনো কোনো দ্রুত উত্তর নেই।") : t("কিছু মেলেনি।")} hint={replies.length === 0 ? t("উপরে প্রথমটা যোগ করুন, যেমন office বা fee।") : undefined} />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-surface-2/60 text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">{t("শর্টকাট")}</th>
                  <th scope="col" className="px-4 py-3">{t("উত্তরের লেখা")}</th>
                  <th scope="col" className="px-4 py-3">{t("অক্ষর")}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t("কাজ")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shown.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-2/40">
                    <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-brand">/{r.shortcut}</td>
                    <td className="max-w-xl px-4 py-3 text-muted"><p className="line-clamp-2 whitespace-pre-wrap" title={r.body}>{r.body}</p></td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{num(r.body.length)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-0.5">
                        <button type="button" className={iconBtn} title={t("সম্পাদনা")} aria-label={t("সম্পাদনা") + ": /" + r.shortcut} onClick={() => setEditing(r)}>
                          <Pencil aria-hidden className="size-[18px]" />
                        </button>
                        <ConfirmAction
                          action={deleteQuickReplyAction}
                          fields={{ id: r.id }}
                          title={t("দ্রুত উত্তর মুছুন")}
                          message={t("/{name} মুছে ফেলবেন? এটা ফেরানো যায় না।", { name: r.shortcut })}
                          confirmLabel={t("মুছুন")}
                          danger
                          className={cn(iconBtn, "hover:bg-danger-soft hover:text-danger")}
                          ariaLabel={t("মুছুন") + ": /" + r.shortcut}
                        >
                          <Trash2 aria-hidden className="size-[18px]" />
                        </ConfirmAction>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted">{t("{n}টির মধ্যে {m}টি দেখানো হচ্ছে", { n: num(replies.length), m: num(shown.length) })}</div>
      </Card>

      <Modal open={adding} onClose={() => setAdding(false)} title={t("নতুন দ্রুত উত্তর")}>
        {adding && <ReplyForm onClose={() => setAdding(false)} />}
      </Modal>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t("দ্রুত উত্তর সম্পাদনা")}>
        {editing && <ReplyForm key={editing.id} reply={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
