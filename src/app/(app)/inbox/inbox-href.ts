import type { InboxParams } from "./page";

/** Builds an /inbox URL from the current params with some overrides; drops defaults. */
export function inboxHref(params: InboxParams, override: Partial<Record<keyof InboxParams, string | null>> = {}): string {
  const merged: Record<string, string | null | undefined> = { ...params, ...override };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (!v) continue;
    if (k === "assigned" && v === "all") continue;
    if (k === "status" && v === "open") continue;
    sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/inbox?${qs}` : "/inbox";
}
