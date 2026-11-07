"use client";

import { useActionState } from "react";
import { submitTemplateAction, type BroadcastFormState } from "@/core/broadcast/actions";

const field = "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function TemplateForm({ channels }: { channels: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<BroadcastFormState, FormData>(submitTemplateAction, {});
  return (
    <form action={action} className="space-y-2 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
      <select name="channelId" className={field}>
        {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input name="name" required pattern="[a-z0-9_]+" maxLength={512} placeholder="নাম: ছোট হাতের ইংরেজি, সংখ্যা ও _ (যেমন eid_offer_2026)" className={field} />
      <div className="flex gap-2">
        <input name="language" defaultValue="bn" required className={`${field} w-28`} aria-label="ভাষার কোড" />
        <select name="category" defaultValue="marketing" className={field}>
          <option value="marketing">Marketing (প্রচার)</option>
          <option value="utility">Utility (লেনদেন/তথ্য)</option>
        </select>
      </div>
      <textarea name="bodyText" required rows={4} maxLength={1024} placeholder="মেসেজের লেখা। পরিবর্তনশীল অংশের জন্য {{1}}, {{2}} লিখুন। যেমন: হ্যালো {{1}}, {{2}} অফার চলছে।" className={field} />
      <textarea name="examples" rows={2} placeholder="প্রতিটা {{ }}-এর জন্য একটা নমুনা মান, প্রতি লাইনে একটা (Meta এটা চায়)" className={field} />
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-emerald-700">{state.ok}</p>}
      <button type="submit" disabled={pending} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">{pending ? "অপেক্ষা করুন…" : "Meta-র কাছে জমা দিন"}</button>
    </form>
  );
}
