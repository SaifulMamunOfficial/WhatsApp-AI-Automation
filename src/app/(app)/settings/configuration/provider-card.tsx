"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { Badge, Card, buttonClass, fieldClass } from "@/components/ui";
import { removeKeyAction, saveProviderAction, testProviderAction, type ConfigFormState } from "@/core/ai/config-actions";
import { useI18n } from "@/lib/i18n/client";

export interface ProviderView {
  provider: "anthropic" | "openai" | "gemini";
  label: string;
  vendor: string;
  hasKey: boolean;
  keyHint: string | null;
  envKey: boolean;
  model: string | null;
  defaultModel: string;
  active: boolean;
  keyUrl: string;
}

export function ProviderCard({ p }: { p: ProviderView }) {
  const { t } = useI18n();
  const [saved, save, saving] = useActionState<ConfigFormState, FormData>(saveProviderAction, {});
  const [tested, test, testing] = useActionState<ConfigFormState, FormData>(testProviderAction, {});
  const canTest = p.hasKey || p.envKey;

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold">{p.label}</h3>
        <span className="text-sm text-muted">{p.vendor}</span>
        <span className="ml-auto flex flex-wrap gap-2">
          {p.active && <Badge tone="success">{t("চালু (bot এটা ব্যবহার করছে)")}</Badge>}
          {p.hasKey ? <Badge tone="brand">{t("Key সেভ করা আছে")} …{p.keyHint ?? "••••"}</Badge> : p.envKey ? <Badge tone="info">{t("সার্ভারের .env-এ key আছে")}</Badge> : <Badge>{t("Key নেই")}</Badge>}
        </span>
      </div>

      <form action={save} className="space-y-3">
        <input type="hidden" name="provider" value={p.provider} />
        <label className="block text-sm">
          <span className="font-semibold">API key</span>
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={p.hasKey ? `••••••••••••••••${p.keyHint ?? ""}` : t("এখানে API key বসান")}
            className={`${fieldClass} mt-1 font-mono`}
          />
          {p.hasKey && <span className="mt-1 block text-xs text-muted">{t("সেভ করা key নিরাপত্তার জন্য আর দেখানো হয় না। নতুন key দিলে বদলাবে; ফাঁকা রাখলে আগেরটাই থাকবে।")}</span>}
        </label>
        <label className="block text-sm">
          <span className="font-semibold">{t("মডেল (ঐচ্ছিক)")}</span>
          <input name="model" defaultValue={p.model ?? ""} placeholder={p.defaultModel} spellCheck={false} className={`${fieldClass} mt-1 font-mono`} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={p.active} /> {t("bot এই provider ব্যবহার করবে")}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={saving} className={buttonClass("primary", "md")}>
            {saving && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {t("সংরক্ষণ")}
          </button>
          {saved.ok && <span role="status" className="text-sm text-success">{t(saved.ok)}</span>}
          {saved.error && <span role="alert" className="text-sm text-danger">{t(saved.error)}</span>}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <form action={test}>
          <input type="hidden" name="provider" value={p.provider} />
          <button type="submit" disabled={!canTest || testing} className={buttonClass("secondary", "sm")}>
            {testing && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {t("পরীক্ষা করুন")}
          </button>
        </form>
        {p.hasKey && (
          <form action={removeKeyAction}>
            <input type="hidden" name="provider" value={p.provider} />
            <button type="submit" className={buttonClass("secondary", "sm", "text-danger")}>{t("Key মুছুন")}</button>
          </form>
        )}
        <a href={p.keyUrl} target="_blank" rel="noreferrer" className="ml-auto text-sm font-semibold text-brand hover:underline">{t("API key কোথায় পাবেন ↗")}</a>
      </div>
      {tested.ok && <p role="status" className="text-sm text-success">{t(tested.ok)}</p>}
      {tested.error && <p role="alert" className="text-sm text-danger">{t(tested.error)}</p>}
    </Card>
  );
}
