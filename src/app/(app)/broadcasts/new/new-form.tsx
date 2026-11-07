"use client";

import { useActionState } from "react";
import { createBroadcastAction, type BroadcastFormState } from "@/core/broadcast/actions";

const field = "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function NewBroadcastForm(p: { channelId: string; templateId: string; tagId: string; body: string; variables: number; reach: number; realChannel: boolean }) {
  const [state, action, pending] = useActionState<BroadcastFormState, FormData>(createBroadcastAction, {});

  return (
    <form action={action} className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <input type="hidden" name="channelId" value={p.channelId} />
      <input type="hidden" name="templateId" value={p.templateId} />
      <input type="hidden" name="tagId" value={p.tagId} />

      <div className="rounded bg-zinc-50 p-2 text-sm whitespace-pre-wrap dark:bg-zinc-900">{p.body || "(টেমপ্লেটের লেখা পাওয়া যায়নি)"}</div>
      <p className="text-sm">
        পৌঁছবে: <strong>{p.reach}</strong> জন (শুধু সম্মতি দেওয়া ও WhatsApp নম্বরধারী)
        {p.reach === 0 && <span className="text-red-700"> — আগে কন্টাক্টদের সম্মতি (opt-in) দিন।</span>}
      </p>
      {p.realChannel && <p className="rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">এটা আসল চ্যানেল। সার্ভারে ALLOW_BROADCAST=true না থাকলে শুরু করা যাবে না।</p>}

      <label className="block text-sm">Broadcast-এর নাম (শুধু আপনার জন্য)
        <input name="name" required maxLength={120} placeholder="যেমন: ঈদ অফার" className={`${field} mt-1`} />
      </label>

      {Array.from({ length: p.variables }, (_, i) => i + 1).map((n) => (
        <div key={n} className="grid grid-cols-[auto_1fr] items-center gap-2 text-sm">
          <span className="font-mono">{`{{${n}}}`}</span>
          <div className="flex gap-2">
            <select name={`p${n}_kind`} defaultValue="fixed" className={`${field} w-44 shrink-0`}>
              <option value="fixed">সবার জন্য একই লেখা</option>
              <option value="first_name">কন্টাক্টের প্রথম নাম</option>
            </select>
            <input name={`p${n}_value`} required placeholder="লেখা (নাম-মোডে: নাম না থাকলে যা বসবে, যেমন ‘গ্রাহক’)" className={field} />
          </div>
        </div>
      ))}

      {state.error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-200">{state.error}</p>}
      <button type="submit" disabled={pending || p.reach === 0} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
        {pending ? "অপেক্ষা করুন…" : "খসড়া বানান ও প্রাপক ঠিক করুন"}
      </button>
      <p className="text-xs text-zinc-500">এতে কিছু পাঠানো হয় না। পরের পাতায় প্রাপকের সংখ্যা লিখে নিশ্চিত করলে তবেই পাঠানো শুরু হবে।</p>
    </form>
  );
}
