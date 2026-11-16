"use client";

import { useState, useTransition } from "react";
import { Check, Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";
import { Modal } from "@/components/modal";
import { StagePill, STAGE_COLOR_MAP } from "@/components/stage-pill";
import { Alert, Badge, Card, EmptyState, Field, StatCard, buttonClass, cn, fieldClass } from "@/components/ui";
import { createStageAction, deleteStageAction, updateStageAction } from "@/core/contacts/actions";
import { ALLOWED_STAGE_COLORS, type LifecycleStage, type StageColorKey } from "@/core/contacts/stages";
import { useI18n } from "@/lib/i18n/client";

function StageForm({
  stage,
  onClose,
}: {
  stage?: LifecycleStage;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(stage?.name ?? "");
  const [colorKey, setColorKey] = useState<StageColorKey>(stage?.colorKey ?? "blue");
  const [sortOrder, setSortOrder] = useState<number>(stage?.sortOrder ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    if (stage) formData.set("stageId", stage.id);
    formData.set("name", name.trim());
    formData.set("colorKey", colorKey);
    formData.set("sortOrder", String(sortOrder));

    startTransition(async () => {
      const res = stage ? await updateStageAction(formData) : await createStageAction(formData);
      if (res.ok) {
        onClose();
      } else {
        setError(res.error ?? "ত্রুটি ঘটেছে।");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <Alert tone="danger">{t(error)}</Alert>}

      <Field label={t("স্টেজের নাম")}>
        <input
          name="name"
          required
          maxLength={100}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("যেমন: Hot Lead, Prospect, VIP")}
          className={fieldClass}
        />
      </Field>

      <Field label={t("রং নির্বাচন (কনট্রাস্ট-নিরাপদ ৮টি রং)")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ALLOWED_STAGE_COLORS.map((k) => {
            const conf = STAGE_COLOR_MAP[k];
            const selected = colorKey === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setColorKey(k)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2 text-left text-xs font-semibold transition-all",
                  selected
                    ? "border-brand bg-brand-soft ring-2 ring-brand/20"
                    : "border-border hover:bg-surface-2",
                )}
              >
                <span className={cn("size-3 rounded-full shrink-0", conf.dot)} />
                <span className="truncate">{t(conf.label)}</span>
                {selected && <Check className="ml-auto size-3 text-brand" />}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={t("ক্রম (Sort Order)")}>
        <input
          name="sortOrder"
          type="number"
          min={0}
          max={999}
          value={sortOrder}
          onChange={(e) => setSortOrder(Number(e.target.value))}
          className={fieldClass}
        />
        <p className="mt-1 text-xs text-muted">
          {t("ছোট সংখ্যা আগে প্রদর্শিত হবে (যেমন: 0, 10, 20…)")}
        </p>
      </Field>

      <div className="rounded-xl border border-border bg-surface-2 p-3">
        <p className="mb-1.5 text-xs font-semibold text-muted">{t("প্রিভিউ:")}</p>
        <StagePill name={name || t("স্টেজের নাম")} colorKey={colorKey} />
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className={buttonClass("secondary", "md")}
        >
          {t("বাতিল করুন")}
        </button>
        <button
          type="submit"
          disabled={isPending}
          className={buttonClass("primary", "md", "gap-1.5")}
        >
          {isPending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {stage ? t("হালনাগাদ করুন") : t("স্টেজ তৈরি করুন")}
        </button>
      </div>
    </form>
  );
}

export function StagesView({ stages }: { stages: LifecycleStage[] }) {
  const { t, num } = useI18n();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<LifecycleStage | null>(null);

  const defaultStage = stages.find((s) => s.isDefault);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          icon={<Layers className="size-5" />}
          label={t("মোট স্টেজ")}
          value={num(stages.length)}
        />
        <StatCard
          icon={<Check className="size-5" />}
          label={t("ডিফল্ট স্টেজ")}
          value={defaultStage?.name ?? t("নেই")}
          hint={t("নতুন কন্টাক্ট তৈরি হলে স্বয়ংক্রিয়ভাবে এই স্টেজে যুক্ত হয়")}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={buttonClass("primary", "md", "gap-1.5")}
        >
          <Plus aria-hidden className="size-4" />
          {t("নতুন স্টেজ")}
        </button>
      </div>

      <Card className="overflow-hidden">
        {stages.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-8" />}
            title={t("কোনো স্টেজ নেই")}
            hint={t("নতুন স্টেজ তৈরি করে কাস্টমারদের ফানেল সাজান।")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-2 text-xs font-semibold text-muted uppercase">
                <tr>
                  <th className="px-4 py-3">{t("নাম ও প্রিভিউ")}</th>
                  <th className="px-4 py-3">{t("রং")}</th>
                  <th className="px-4 py-3 text-center">{t("ক্রম")}</th>
                  <th className="px-4 py-3 text-center">{t("ডিফল্ট")}</th>
                  <th className="px-4 py-3 text-right">{t("পদক্ষেপ")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stages.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <StagePill name={s.name} colorKey={s.colorKey} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      <span className="capitalize">{s.colorKey}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-muted font-mono">
                      {num(s.sortOrder)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.isDefault ? (
                        <Badge tone="success">{t("ডিফল্ট")}</Badge>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing(s)}
                          className={buttonClass("secondary", "sm")}
                          aria-label={t("সম্পাদনা")}
                          title={t("সম্পাদনা")}
                        >
                          <Pencil aria-hidden className="size-3.5" />
                        </button>

                        {!s.isDefault && (
                          <ConfirmAction
                            action={deleteStageAction}
                            fields={{ stageId: s.id }}
                            title={t("স্টেজ মুছুন")}
                            message={t("আপনি কি নিশ্চিত যে এই স্টেজটি মুছতে চান? কন্টাক্টগুলোর স্টেজ খালি হবে।")}
                            confirmLabel={t("মুছুন")}
                            danger
                            className={buttonClass("danger", "sm")}
                            ariaLabel={t("মুছুন") + ": " + s.name}
                            tooltip={t("মুছুন")}
                          >
                            <Trash2 aria-hidden className="size-3.5" />
                          </ConfirmAction>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t("নতুন লাইফসাইকেল স্টেজ")}
        size="md"
      >
        <StageForm onClose={() => setCreating(false)} />
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("স্টেজ সম্পাদনা")}
        size="md"
      >
        {editing && <StageForm stage={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
