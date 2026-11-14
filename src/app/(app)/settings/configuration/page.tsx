import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/core/auth/dal";
import { listProviderStatus } from "@/core/ai/config";
import { queueSummary } from "@/core/jobs/queue";
import { db } from "@/db";
import { Alert, Badge, Card, PageHeader } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { ProviderCard, type ProviderView } from "./provider-card";

export const metadata = { title: "Configuration — Saimum CRM" };

export default function ConfigurationPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

const META: Record<ProviderView["provider"], Pick<ProviderView, "label" | "vendor" | "keyUrl">> = {
  anthropic: { label: "Claude", vendor: "Anthropic", keyUrl: "https://console.anthropic.com/settings/keys" },
  openai: { label: "ChatGPT", vendor: "OpenAI", keyUrl: "https://platform.openai.com/api-keys" },
  gemini: { label: "Gemini", vendor: "Google", keyUrl: "https://aistudio.google.com/apikey" },
};

async function Content() {
  await requireRole("admin");
  const { t, num } = await getT();
  const statuses = await listProviderStatus(db);
  const jobs = await queueSummary(db);
  const anyActive = statuses.some((s) => s.active && s.hasKey);
  const anyKey = statuses.some((s) => s.hasKey || s.envKey);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title={t("কনফিগারেশন")} description={t("AI bot (agent) কোন সেবার API key দিয়ে চলবে, এখানে ঠিক করুন।")} />

      {!anyKey && <Alert tone="warning">{t("কোনো API key নেই, তাই AI উত্তর বন্ধ আছে। স্বাগত মেসেজ, অফিস সময়ের নোটিস ও keyword মেনু AI ছাড়াই চলে।")}</Alert>}
      {anyKey && !anyActive && <Alert tone="info">{t("কোনো provider ‘চালু’ করা নেই; সার্ভারের .env-এর key (থাকলে) ব্যবহার হবে।")}</Alert>}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">{t("AI provider ও API key")}</h2>
          <p className="max-w-prose text-sm text-muted">
            {t("Key সার্ভারে এনক্রিপ্ট করে রাখা হয় এবং এখানে আর কখনো দেখানো হয় না (শুধু শেষ ৪ অক্ষর)। একবারে একটাই provider চালু থাকে।")}
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          {statuses.map((s) => (
            <ProviderCard key={s.provider} p={{ ...s, ...META[s.provider] }} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">{t("পটভূমির কাজ")}</h2>
          <p className="max-w-prose text-sm text-muted">{t("bot-এর উত্তর, AI আর ফাইল নামানোর কাজ এই তালিকায় জমা থাকে, সার্ভার রিস্টার্ট হলেও হারায় না। ব্যর্থ হলে নিজে থেকে কয়েকবার আবার চেষ্টা হয়।")}</p>
        </div>
        <Card className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone="info">{t("অপেক্ষায় {n}", { n: num(jobs.queued) })}</Badge>
            <Badge tone="brand">{t("চলছে {n}", { n: num(jobs.running) })}</Badge>
            <Badge tone={jobs.failed > 0 ? "danger" : "success"}>{t("{n}টি ব্যর্থ", { n: num(jobs.failed) })}</Badge>
          </div>
          {jobs.recentFailures.length > 0 && (
            <ul className="space-y-1 text-sm text-muted">
              {jobs.recentFailures.map((f) => (
                <li key={f.id}><span className="font-mono">{f.queue}</span>: {f.error ?? "—"}</li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <p className="text-sm text-muted">
        {t("AI যে তথ্য থেকে উত্তর দেয়, সেটা")}{" "}
        <Link href="/settings/knowledge" className="font-semibold text-brand hover:underline">{t("জ্ঞানভান্ডার ও AI")}</Link> {t("পেজে।")}
      </p>
    </div>
  );
}
