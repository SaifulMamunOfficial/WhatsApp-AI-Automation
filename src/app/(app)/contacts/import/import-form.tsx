"use client";

import { useActionState } from "react";
import { importContactsAction, type ImportState } from "@/core/contacts/actions";

const field = "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export function ImportForm({ channels }: { channels: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importContactsAction, {});
  const r = state.result;

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <label className="block text-sm">
          চ্যানেল
          <select name="channelId" className={`${field} mt-1`}>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          CSV ফাইল
          <input type="file" name="file" accept=".csv,text/csv,text/plain" required className={`${field} mt-1`} />
        </label>
        <label className="block text-sm">
          সবার জন্য একটা ট্যাগ (ঐচ্ছিক)
          <input name="extraTag" maxLength={40} placeholder="যেমন: ২০২৬ ব্যাচ" className={`${field} mt-1`} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dryRun" defaultChecked /> আগে পরীক্ষা করুন (কিছু সেভ হবে না)
        </label>
        <button type="submit" disabled={pending} className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          {pending ? "অপেক্ষা করুন…" : "চালান"}
        </button>
      </form>

      {state.error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-200">{state.error}</p>}

      {r?.fatal && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-200">{r.fatal}</p>}

      {r && !r.fatal && (
        <div role="status" className="space-y-2 rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <p className="font-medium">{r.dryRun ? "পরীক্ষার ফল (কিছু সেভ হয়নি)" : "আমদানি সম্পন্ন"}</p>
          <ul className="list-inside list-disc">
            <li>নতুন কন্টাক্ট: {r.created}</li>
            <li>আগে থেকে ছিল (ট্যাগ যোগ হয়েছে): {r.updated}</li>
            <li>ফাইলে একই নম্বর বারবার: {r.duplicatesInFile}</li>
            <li>নতুন ট্যাগ: {r.tagsCreated}</li>
            <li>ত্রুটিপূর্ণ সারি: {r.errors.length}</li>
          </ul>
          {r.errors.length > 0 && (
            <ul className="max-h-48 overflow-y-auto rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-900">
              {r.errors.slice(0, 100).map((e) => (
                <li key={`${e.line}-${e.message}`}>সারি {e.line}: {e.message}</li>
              ))}
              {r.errors.length > 100 && <li>…আরও {r.errors.length - 100}টি</li>}
            </ul>
          )}
          {r.dryRun && <p className="text-zinc-500">ঠিক থাকলে ‘আগে পরীক্ষা করুন’ টিক তুলে আবার চালান।</p>}
        </div>
      )}
    </div>
  );
}
