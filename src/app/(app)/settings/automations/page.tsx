import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { requireRole } from "@/core/auth/dal";
import { addKeywordAction, deleteAutomationAction, saveSimpleAction, setBotEnabledAction, toggleAutomationAction } from "@/core/automation/actions";
import { parseAutomation } from "@/core/automation/config";
import { officeHoursFromEnv } from "@/core/automation/office-hours";
import { db } from "@/db";
import { automations, channels } from "@/db/schema";

export const metadata = { title: "অটোমেশন — Saimum CRM" };

export default function AutomationsPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">লোড হচ্ছে…</p>}>
      <Content />
    </Suspense>
  );
}

const field = "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";
const btn = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700";

async function Content() {
  await requireRole("admin");
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
    <main className="mx-auto w-full max-w-3xl space-y-8 p-4">
      <section className="space-y-3">
        <h1 className="text-lg font-semibold">Bot চালু/বন্ধ</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          নতুন চ্যানেল bot বন্ধ অবস্থায় শুরু হয়। মানুষ (ফোন/পেজ ইনবক্স/CRM) উত্তর দিলে ওই কথোপকথনে bot নিজে থেকেই থেমে যায়।
        </p>
        <ul className="space-y-2">
          {chs.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800">
              <span>
                {c.name} <span className="text-zinc-500">({c.type === "whatsapp" ? "WhatsApp" : "Messenger"})</span> — {c.botEnabled ? "bot চালু" : "bot বন্ধ"}
              </span>
              <form action={setBotEnabledAction}>
                <input type="hidden" name="channelId" value={c.id} />
                <input type="hidden" name="enabled" value={String(!c.botEnabled)} />
                <button type="submit" className={btn}>{c.botEnabled ? "বন্ধ করুন" : "চালু করুন"}</button>
              </form>
            </li>
          ))}
          {chs.length === 0 && <li className="text-sm text-zinc-500">কোনো চ্যানেল নেই।</li>}
        </ul>
      </section>

      {([
        { kind: "welcome", title: "স্বাগত মেসেজ", hint: "নতুন গ্রাহকের প্রথম মেসেজে, বা অনেকদিন পর ফিরে এলে (৭২ ঘণ্টা)।", p: welcome },
        { kind: "office_hours", title: "অফিস সময়ের বাইরে", hint: `অফিস সময়: ${hours.open}–${hours.close} (${hours.tz})। এর বাইরে এই মেসেজ যায় (১২ ঘণ্টায় একবার)।`, p: office },
      ] as const).map(({ kind, title, hint, p }) => (
        <section key={kind} className="space-y-2">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{hint}</p>
          <form action={saveSimpleAction} className="space-y-2">
            <input type="hidden" name="kind" value={kind} />
            <textarea name="text" rows={3} maxLength={1000} required defaultValue={p?.a && "text" in p.a.config ? p.a.config.text : ""} className={field} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="enabled" defaultChecked={p?.row.enabled ?? true} /> চালু
            </label>
            <button type="submit" className={btn}>সংরক্ষণ</button>
          </form>
        </section>
      ))}

      <section className="space-y-3">
        <h2 className="font-semibold">Keyword উত্তর</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          গ্রাহকের মেসেজে keyword থাকলে এই উত্তর যায় (বাংলা ও ইংরেজি সংখ্যা সমান ধরা হয়: ১ = 1)। মেনুর জন্য একটা নিয়মে keyword <code>menu, মেনু</code> দিয়ে অপশনের তালিকা লিখুন।
        </p>
        <ul className="space-y-2">
          {keywords.map(({ row, a }) => a?.kind === "keyword" && (
            <li key={row.id} className={`rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800 ${row.enabled ? "" : "opacity-60"}`}>
              <div className="font-medium">{a.config.keywords.join(", ")} <span className="font-normal text-zinc-500">({a.config.match === "exact" ? "পুরো মেসেজ মিললে" : "মেসেজে থাকলে"})</span></div>
              <p className="mt-1 whitespace-pre-wrap">{a.config.reply}</p>
              <div className="mt-2 flex gap-2">
                <form action={toggleAutomationAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="enabled" value={String(!row.enabled)} />
                  <button type="submit" className={btn}>{row.enabled ? "বন্ধ করুন" : "চালু করুন"}</button>
                </form>
                <form action={deleteAutomationAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <button type="submit" className={btn}>মুছুন</button>
                </form>
              </div>
            </li>
          ))}
          {keywords.length === 0 && <li className="text-sm text-zinc-500">কোনো keyword নিয়ম নেই।</li>}
        </ul>

        <form action={addKeywordAction} className="space-y-2 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
          <h3 className="text-sm font-medium">নতুন নিয়ম</h3>
          <input name="keywords" required placeholder="Keyword (কমা দিয়ে আলাদা): 1, মূল্য, price" className={field} />
          <textarea name="reply" rows={3} maxLength={1000} required placeholder="উত্তর" className={field} />
          <select name="match" defaultValue="contains" className={field}>
            <option value="contains">মেসেজে keyword থাকলে</option>
            <option value="exact">পুরো মেসেজ keyword-এর সমান হলে</option>
          </select>
          <button type="submit" className={btn}>যোগ করুন</button>
        </form>
      </section>
    </main>
  );
}
