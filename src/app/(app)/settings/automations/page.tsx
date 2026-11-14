import Link from "next/link";
import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { Bot, ChevronRight, Hand, KeyRound, Moon } from "lucide-react";
import type { ReactNode } from "react";
import { requireRole } from "@/core/auth/dal";
import { addKeywordAction, deleteAutomationAction, saveSimpleAction, setBotModeAction, toggleAutomationAction } from "@/core/automation/actions";
import { botModeOf, type BotMode } from "@/core/automation/bot-mode";
import { parseAutomation } from "@/core/automation/config";
import { officeHoursFromEnv } from "@/core/automation/office-hours";
import { db } from "@/db";
import { automations, channels } from "@/db/schema";
import { Badge, Card, ChannelBadge, EmptyState, Field, PageHeader, PageShell, StatCard, buttonClass, cn, fieldClass } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import type { TFn } from "@/lib/i18n";

export const metadata = { title: "Automation — Saimum CRM" };

export default function AutomationsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

const btn = buttonClass("secondary", "sm");

const MODE_TONE: Record<BotMode, "neutral" | "info" | "success"> = { off: "neutral", after_hours: "info", always: "success" };

function modeLabel(mode: BotMode, t: TFn): string {
  return mode === "off" ? t("বন্ধ") : mode === "after_hours" ? t("শুধু অফিস বন্ধের সময়") : t("সবসময় চালু");
}

/** One card per message type (welcome / after-hours): the text, an on/off box and Save. */
function MessageCard({ title, hint, kind, text, enabled, saved, t, children }: { title: string; hint: ReactNode; kind: "welcome" | "office_hours"; text: string; enabled: boolean; saved: boolean; t: TFn; children?: ReactNode }) {
  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {saved ? <Badge tone={enabled ? "success" : "neutral"}>{enabled ? t("চালু") : t("বন্ধ")}</Badge> : <Badge tone="warning">{t("এখনো লেখা হয়নি")}</Badge>}
      </div>
      <p className="text-sm text-muted">{hint}</p>
      {children}
      {/* key: React resets the form after the action, so remount when the saved text changes */}
      <form key={`${text}|${enabled}`} action={saveSimpleAction} className="space-y-3">
        <input type="hidden" name="kind" value={kind} />
        <textarea name="text" rows={3} maxLength={1000} required defaultValue={text} aria-label={title} className={fieldClass} />
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4" /> {t("চালু")}
        </label>
        <button type="submit" className={buttonClass("primary", "md")}>{t("সংরক্ষণ")}</button>
      </form>
    </Card>
  );
}

async function Content() {
  await requireRole("admin");
  const { t, num } = await getT();
  const [chs, rows] = await Promise.all([
    db.select().from(channels).orderBy(asc(channels.createdAt)),
    db.select().from(automations).orderBy(asc(automations.priority)),
  ]);
  const parsed = rows.map((r) => ({ row: r, a: parseAutomation({ id: r.id, kind: r.kind, priority: r.priority, channelId: r.channelId, config: r.config }) }));
  const welcome = parsed.find((p) => p.a?.kind === "welcome" && p.row.channelId === null);
  const office = parsed.find((p) => p.a?.kind === "office_hours" && p.row.channelId === null);
  const keywords = parsed.filter((p) => p.a?.kind === "keyword");
  const hours = officeHoursFromEnv();
  const textOf = (p: typeof welcome) => (p?.a && "text" in p.a.config ? p.a.config.text : "");

  const order = [t("Keyword"), t("AI"), t("ছুটির বার্তা"), t("অফিস সময়ের বাইরে"), t("স্বাগত মেসেজ")];

  return (
    <PageShell>
      <PageHeader title={t("অটোমেশন")} description={t("bot গ্রাহকের মেসেজে কখন কী উত্তর দেবে, এখানে ঠিক করুন।")} />

      <section aria-label={t("মূল সংখ্যা")} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Bot className="size-5" />} label={t("bot চালু চ্যানেল")} value={num(chs.filter((c) => c.botEnabled).length)} hint={t("মোট {n}টির মধ্যে", { n: num(chs.length) })} tone={chs.some((c) => c.botEnabled) ? "success" : undefined} />
        <StatCard icon={<Hand className="size-5" />} label={t("স্বাগত মেসেজ")} value={welcome?.row.enabled ? t("চালু") : t("বন্ধ")} tone={welcome?.row.enabled ? "success" : undefined} />
        <StatCard icon={<Moon className="size-5" />} label={t("অফিস সময়ের বাইরে")} value={office?.row.enabled ? t("চালু") : t("বন্ধ")} tone={office?.row.enabled ? "success" : undefined} />
        <StatCard icon={<KeyRound className="size-5" />} label={t("চালু keyword নিয়ম")} value={num(keywords.filter((k) => k.row.enabled).length)} hint={t("মোট {n}টির মধ্যে", { n: num(keywords.length) })} />
      </section>

      <Card className="space-y-3 p-4 sm:p-5">
        <h2 className="text-base font-bold">{t("উত্তরের ক্রম")}</h2>
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm font-semibold">
          {order.map((label, i) => (
            <li key={label} className="inline-flex items-center gap-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-brand">
                <span aria-hidden className="text-xs opacity-70">{num(i + 1)}</span>
                {label}
              </span>
              {i < order.length - 1 && <ChevronRight aria-hidden className="size-4 text-muted" />}
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">{t("bot প্রতি মেসেজে একটাই উত্তর দেয়; ওপরের নিয়ম আগে মিললে নিচেরগুলো যায় না। মানুষ উত্তর দিলে ওই কথোপকথনে bot নিজে থেকেই থেমে যায়।")}</p>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="min-w-0 space-y-6">
          <Card className="space-y-4 p-4 sm:p-5">
            <h2 className="text-base font-bold">{t("Bot চালু/বন্ধ")}</h2>
            <p className="text-sm text-muted">
              {t("নতুন চ্যানেল bot বন্ধ অবস্থায় শুরু হয়। মানুষ (ফোন/পেজ ইনবক্স/CRM) উত্তর দিলে ওই কথোপকথনে bot নিজে থেকেই থেমে যায়।")}{" "}
              {t("‘শুধু অফিস বন্ধের সময়’ মানে অফিস সময়ের বাইরে ও ছুটির দিনে bot উত্তর দেয়, অফিস খোলা থাকলে শুধু মানুষ। আসল নম্বরে প্রথমে এটা চালান, কিছুদিন দেখে ‘সবসময় চালু’ করুন।")}
            </p>
            {chs.length === 0 ? (
              <p className="text-sm text-muted">{t("কোনো চ্যানেল নেই।")}</p>
            ) : (
              <ul className="space-y-2">
                {chs.map((c) => {
                  const mode = botModeOf(c);
                  return (
                    <li key={c.id} className="space-y-2 rounded-xl border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <ChannelBadge type={c.type} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
                        {c.isTest && <Badge>{t("টেস্ট")}</Badge>}
                        <Badge tone={MODE_TONE[mode]}>{modeLabel(mode, t)}</Badge>
                      </div>
                      <form action={setBotModeAction} className="flex items-center gap-2">
                        <input type="hidden" name="channelId" value={c.id} />
                        {/* key: React resets the form after the action, so remount to show the new server value */}
                        <select key={mode} name="mode" defaultValue={mode} aria-label={t("bot-এর মোড")} className={cn(fieldClass, "min-h-10 min-w-0 flex-1 py-1")}>
                          <option value="off">{t("বন্ধ")}</option>
                          <option value="after_hours">{t("শুধু অফিস বন্ধের সময়")}</option>
                          <option value="always">{t("সবসময় চালু")}</option>
                        </select>
                        <button type="submit" className={buttonClass("secondary", "md")}>{t("সেট")}</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <MessageCard
            kind="welcome"
            title={t("স্বাগত মেসেজ")}
            hint={t("নতুন গ্রাহকের প্রথম মেসেজে, বা অনেকদিন পর ফিরে এলে (৭২ ঘণ্টা)।")}
            text={textOf(welcome)}
            enabled={welcome?.row.enabled ?? true}
            saved={!!welcome}
            t={t}
          />

          <MessageCard
            kind="office_hours"
            title={t("অফিস সময়ের বাইরে")}
            hint={t("অফিস সময়: {open}–{close} ({tz})। এর বাইরে এই মেসেজ যায় (১২ ঘণ্টায় একবার)।", { open: hours.open, close: hours.close, tz: hours.tz })}
            text={textOf(office)}
            enabled={office?.row.enabled ?? true}
            saved={!!office}
            t={t}
          >
            <p className="text-sm text-muted">
              {t("ছুটির দিনের আলাদা বার্তা")}{" "}
              <Link href="/settings/holidays" className="font-semibold text-brand hover:underline">{t("ছুটির দিন")}</Link> {t("পেজে।")}
            </p>
          </MessageCard>
        </div>

        <Card className="min-w-0 space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold">{t("Keyword উত্তর")}</h2>
            <Badge>{t("{n}টি নিয়ম", { n: num(keywords.length) })}</Badge>
          </div>
          <p className="text-sm text-muted">
            {t("গ্রাহকের মেসেজে keyword থাকলে এই উত্তর যায় (বাংলা ও ইংরেজি সংখ্যা সমান ধরা হয়: ১ = 1)। মেনুর জন্য একটা নিয়মে keyword menu, মেনু দিয়ে অপশনের তালিকা লিখুন।")}
          </p>

          {keywords.length === 0 ? (
            <EmptyState title={t("কোনো keyword নিয়ম নেই।")} hint={t("নিচের ফর্ম থেকে প্রথমটা যোগ করুন।")} />
          ) : (
            <ul className="space-y-3">
              {keywords.map(({ row, a }) =>
                a?.kind === "keyword" ? (
                  <li key={row.id} className={cn("space-y-3 rounded-xl border border-border p-3.5 text-sm", !row.enabled && "opacity-60")}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {a.config.keywords.map((k) => (
                        <span key={k} className="rounded-full bg-surface-2 px-2.5 py-0.5 font-mono text-xs font-semibold">{k}</span>
                      ))}
                      <Badge tone="info" className="ml-auto">{a.config.match === "exact" ? t("পুরো মেসেজ মিললে") : t("মেসেজে থাকলে")}</Badge>
                      {!row.enabled && <Badge tone="warning">{t("বন্ধ করা")}</Badge>}
                    </div>
                    <p className="whitespace-pre-wrap rounded-lg bg-surface-2/60 p-3">{a.config.reply}</p>
                    <div className="flex flex-wrap gap-2">
                      <form action={toggleAutomationAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="enabled" value={String(!row.enabled)} />
                        <button type="submit" className={btn}>{row.enabled ? t("বন্ধ করুন") : t("চালু করুন")}</button>
                      </form>
                      <form action={deleteAutomationAction}>
                        <input type="hidden" name="id" value={row.id} />
                        <button type="submit" className={cn(btn, "text-danger")}>{t("মুছুন")}</button>
                      </form>
                    </div>
                  </li>
                ) : null,
              )}
            </ul>
          )}

          <form action={addKeywordAction} className="space-y-3 rounded-xl border border-dashed border-border-strong bg-surface-2/40 p-4">
            <h3 className="text-sm font-bold">{t("নতুন নিয়ম")}</h3>
            <Field label={t("Keyword")}>
              <input name="keywords" required placeholder={t("Keyword (কমা দিয়ে আলাদা): 1, মূল্য, price")} className={fieldClass} />
            </Field>
            <Field label={t("উত্তর")}>
              <textarea name="reply" rows={3} maxLength={1000} required className={fieldClass} />
            </Field>
            <Field label={t("কখন মিলবে")}>
              <select name="match" defaultValue="contains" className={fieldClass}>
                <option value="contains">{t("মেসেজে keyword থাকলে")}</option>
                <option value="exact">{t("পুরো মেসেজ keyword-এর সমান হলে")}</option>
              </select>
            </Field>
            <button type="submit" className={buttonClass("primary", "md")}>{t("যোগ করুন")}</button>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
