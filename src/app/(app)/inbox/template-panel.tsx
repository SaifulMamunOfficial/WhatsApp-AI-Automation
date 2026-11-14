"use client";

import { Loader2, Send } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Field, buttonClass, fieldClass } from "@/components/ui";
import { sendTemplateAction, type FormState } from "@/core/inbox/actions";
import { useI18n } from "@/lib/i18n/client";

export interface TemplateOption {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  variables: number;
}

const fill = (body: string, values: string[]) => body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n: string) => values[Number(n) - 1]?.trim() || `{{${n}}}`);

/** After the 24-hour window WhatsApp only allows approved templates: pick one, fill the blanks, send. */
export function TemplatePanel({ conversationId, templates, optedIn }: { conversationId: string; templates: TemplateOption[]; optedIn: boolean }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<FormState, FormData>(sendTemplateAction, {});
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [values, setValues] = useState<string[]>([]);
  const chosen = templates.find((x) => x.id === templateId);

  if (templates.length === 0) {
    return (
      <Alert tone="info">
        {t("এই চ্যানেলে কোনো অনুমোদিত টেমপ্লেট নেই।")}{" "}
        <Link href="/broadcasts/templates" className="font-semibold underline">{t("টেমপ্লেট পাতা")}</Link>
      </Alert>
    );
  }

  const blocked = !!chosen && chosen.category.toLowerCase() === "marketing" && !optedIn;

  return (
    <form action={action} className="space-y-3 rounded-xl border border-border bg-surface-2/50 p-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="varCount" value={chosen?.variables ?? 0} />
      <p className="text-sm font-semibold">{t("টেমপ্লেট পাঠান")}</p>

      <Field label={t("অনুমোদিত টেমপ্লেট")}>
        <select
          name="templateId"
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.target.value);
            setValues([]);
          }}
          className={fieldClass}
        >
          {templates.map((x) => (
            <option key={x.id} value={x.id}>{x.name} ({x.language} · {x.category})</option>
          ))}
        </select>
      </Field>

      {chosen &&
        Array.from({ length: chosen.variables }, (_, i) => (
          <Field key={`${chosen.id}-${i}`} label={`{{${i + 1}}}`}>
            <input
              name={`p${i + 1}`}
              required
              maxLength={500}
              value={values[i] ?? ""}
              onChange={(e) => setValues((v) => Object.assign([...v], { [i]: e.target.value }))}
              className={fieldClass}
            />
          </Field>
        ))}

      {chosen && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted">{t("গ্রাহক যা দেখবেন")}</p>
          <p className="whitespace-pre-wrap rounded-lg bg-surface p-3 text-sm">{fill(chosen.body, values) || "—"}</p>
        </div>
      )}

      {blocked && <Alert tone="warning">{t("এই গ্রাহক প্রচারমূলক বার্তা পেতে সম্মতি দেননি, তাই marketing টেমপ্লেট পাঠানো যায় না।")}</Alert>}
      {state.error && <Alert tone="danger">{t(state.error)}</Alert>}

      <button type="submit" disabled={pending || blocked || !chosen} className={buttonClass("primary", "md")}>
        {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <Send aria-hidden className="size-4" />}
        {t("টেমপ্লেট পাঠান")}
      </button>
      <p className="text-xs text-muted">{t("এতে ২৪ ঘণ্টার সময় আবার খোলে না; গ্রাহক উত্তর দিলে তবেই সাধারণ মেসেজ পাঠানো যাবে।")}</p>
    </form>
  );
}
