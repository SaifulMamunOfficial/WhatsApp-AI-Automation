import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { normalizeText } from "@/core/automation/text";
import type { Db } from "@/core/inbox/ingest";

// Consent (opt-in) for broadcast/marketing messages. Broadcasts go ONLY to opted-in contacts,
// and a customer can withdraw by replying with a stop word.

const OPT_OUT_WORDS = new Set(["stop", "unsubscribe", "optout", "opt out", "স্টপ", "আনসাবস্ক্রাইব"]);

/** True when the whole message is a stop word. Exact match: "বন্ধ" inside a sentence must not unsubscribe anyone. */
export function isOptOutText(text: string | null | undefined): boolean {
  if (!text) return false;
  return OPT_OUT_WORDS.has(normalizeText(text));
}

export type ConsentSource = "manual" | "csv_import" | "customer_stop";

export async function setOptIn(db: Db, contactId: string, optedIn: boolean, source: ConsentSource): Promise<{ ok: true } | { ok: false; error: string }> {
  const c = schema.contacts;
  const done = await db
    .update(c)
    .set({ optedIn, optInSource: source, ...(optedIn ? { optedInAt: new Date() } : {}), updatedAt: new Date() })
    .where(eq(c.id, contactId))
    .returning({ id: c.id });
  return done.length ? { ok: true } : { ok: false, error: "কন্টাক্ট পাওয়া যায়নি।" };
}
