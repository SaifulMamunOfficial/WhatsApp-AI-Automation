"use client";

import { useActionState } from "react";
import { startBroadcastAction, type BroadcastFormState } from "@/core/broadcast/actions";

export function StartForm({ id, total }: { id: string; total: number }) {
  const [state, action, pending] = useActionState<BroadcastFormState, FormData>(startBroadcastAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block text-sm">
        নিশ্চিত করতে প্রাপকের সংখ্যা লিখুন ({total})
        <input name="confirmCount" required inputMode="numeric" autoComplete="off" className="mt-1 w-32 rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-emerald-700">{state.ok}</p>}
      <button type="submit" disabled={pending} className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {pending ? "অপেক্ষা করুন…" : "পাঠান"}
      </button>
    </form>
  );
}
