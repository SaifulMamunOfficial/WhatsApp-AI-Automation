import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { requireRole } from "@/core/auth/dal";
import { addKeywordAction, deleteAutomationAction, saveSimpleAction, setBotModeAction, toggleAutomationAction } from "@/core/automation/actions";
import { botModeOf } from "@/core/automation/bot-mode";
import { parseAutomation } from "@/core/automation/config";
import { officeHoursFromEnv } from "@/core/automation/office-hours";
import { db } from "@/db";
import { automations, channels } from "@/db/schema";
import { buttonClass, fieldClass } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Automation — Saimum CRM" };

export default function AutomationsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

const field = fieldClass;
const btn = buttonClass("secondary", "sm");

async function Content() {
  await requireRole("admin");
  const { t } = await getT();
  const [chs, rows] = await Promise.all([
    db.select().from(channels).orderBy(asc(channels.createdAt)),
    db.select().from(automations).orderBy(asc(automations.priority)),
  ]);
  const parsed = rows.map((r) => ({ row: r, a: parseAutomation({ id: r.id, kind: r.kind, priority: r.priority, channelId: r.channelId, config: r.config }) }));
  const welcome = parsed.find((p) => p.a?.kind === "welcome" && p.row.channelId === null);
  const office = parsed.find((p) => p.a?.kind === "office_hours" && p.row.channelId === null);
  const keywords = parsed.filter((p) => p.a?.kind === "keyword");
  const hours = officeHoursFromEnv();

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h1 className="text-2xl font-bold tracking-tight">{t("Bot চালু/বন্ধ")}</h1>
        <p className="text-sm text-muted">
          {t("নতুন চ্যানেল bot বন্ধ অবস্থায় শুরু হয়। মানুষ (ফোন/পেজ ইনবক্স/CRM) উত্তর দিলে ওই কথোপকথনে bot নিজে থেকেই থেমে যায়।")}
          {" "}{t("‘শুধু অফিস বন্ধের সময়’ মানে অফিস সময়ের বাইরে ও ছুটির দিনে bot উত্তর দেয়, অফিস খোলা থাকলে শুধু মানুষ। আসল নম্বরে প্রথমে এটা চালান, কিছুদিন দেখে ‘সবসময় চালু’ করুন।")}
        </p>
        <ul className="space-y-2">
          {chs.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <span>
                {c.name} <span className="text-muted">({c.type === "whatsapp" ? "WhatsApp" : "Messenger"})</span>
              </span>
              <form action={setBotModeAction} className="flex w-full items-center gap-2 sm:w-auto">
                <input type="hidden" name="channelId" value={c.id} />
                {/* key: React resets the form after the action, so remount to show the new server value */}
                <select key={botModeOf(c)} name="mode" defaultValue={botModeOf(c)} aria-label={t("bot-এর মোড")} className={`${field} min-h-9 min-w-0 flex-1 py-1 sm:w-60 sm:flex-none`}>
                  <option value="off">{t("বন্ধ")}</option>
                  <option value="after_hours">{t("শুধু অফিস বন্ধের সময়")}</option>
                  <option value="always">{t("সবসময় চালু")}</option>
                </select>
                <button type="submit" className={btn}>{t("সেট")}</button>
              </form>
            </li>
          ))}
          {chs.length === 0 && <li className="text-sm text-muted">{t("কোনো চ্যানেল নেই।")}</li>}
        </ul>
      </section>

      {([
        { kind: "welcome", title: t("স্বাগত মেসেজ"), hint: t("নতুন গ্রাহকের প্রথম মেসেজে, বা অনেকদিন পর ফিরে এলে (৭২ ঘণ্টা)।"), p: welcome },
        { kind: "office_hours", title: t("অফিস সময়ের বাইরে"), hint: t("অফিস সময়: {open}–{close} ({tz})। এর বাইরে এই মেসেজ যায় (১২ ঘণ্টায় একবার)।", { open: hours.open, close: hours.close, tz: hours.tz }), p: office },
      ] as const).map(({ kind, title, hint, p }) => (
        <section key={kind} className="space-y-2">
          <h2 className="text-base font-bold">{title}</h2>
          <p className="text-sm text-muted">{hint}</p>
          <form action={saveSimpleAction} className="space-y-2">
            <input type="hidden" name="kind" value={kind} />
            <textarea name="text" rows={3} maxLength={1000} required defaultValue={p?.a && "text" in p.a.config ? p.a.config.text : ""} className={field} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={p?.row.enabled ?? true} /> {t("চালু")}
            </label>
            <button type="submit" className={btn}>{t("সংরক্ষণ")}</button>
          </form>
        </section>
      ))}

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <h2 className="text-base font-bold">{t("Keyword উত্তর")}</h2>
        <p className="text-sm text-muted">
          {t("গ্রাহকের মেসেজে keyword থাকলে এই উত্তর যায় (বাংলা ও ইংরেজি সংখ্যা সমান ধরা হয়: ১ = 1)। মেনুর জন্য একটা নিয়মে keyword menu, মেনু দিয়ে অপশনের তালিকা লিখুন।")}
        </p>
        <ul className="space-y-2">
          {keywords.map(({ row, a }) => a?.kind === "keyword" && (
            <li key={row.id} className={`rounded-xl border border-border bg-surface-2/50 p-3.5 text-sm ${row.enabled ? "" : "opacity-60"}`}>
              <div className="font-medium">{a.config.keywords.join(", ")} <span className="font-normal text-muted">({a.config.match === "exact" ? t("পুরো মেসেজ মিললে") : t("মেসেজে থাকলে")})</span></div>
              <p className="mt-1 whitespace-pre-wrap">{a.config.reply}</p>
              <div className="mt-2 flex gap-2">
                <form action={toggleAutomationAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="enabled" value={String(!row.enabled)} />
                  <button type="submit" className={btn}>{row.enabled ? t("বন্ধ করুন") : t("চালু করুন")}</button>
                </form>
                <form action={deleteAutomationAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" className={btn}>{t("মুছুন")}</button>
                </form>
              </div>
            </li>
          ))}
          {keywords.length === 0 && <li className="text-sm text-muted">{t("কোনো keyword নিয়ম নেই।")}</li>}
        </ul>

        <form action={addKeywordAction} className="space-y-2 rounded-xl border border-dashed border-border-strong bg-surface-2/40 p-4">
          <h3 className="text-sm font-medium">{t("নতুন নিয়ম")}</h3>
          <input name="keywords" required placeholder={t("Keyword (কমা দিয়ে আলাদা): 1, মূল্য, price")} className={field} />
          <textarea name="reply" rows={3} maxLength={1000} required placeholder={t("উত্তর")} className={field} />
          <select name="match" defaultValue="contains" className={field}>
            <option value="contains">{t("মেসেজে keyword থাকলে")}</option>
            <option value="exact">{t("পুরো মেসেজ keyword-এর সমান হলে")}</option>
          </select>
          <button type="submit" className={btn}>{t("যোগ করুন")}</button>
        </form>
      </section>
    </main>
  );
}
