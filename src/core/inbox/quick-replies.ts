import { asc, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "./ingest";
import { matchQuickReplies, type QuickReply } from "./quick-reply-match";

export { matchQuickReplies, type QuickReply };

// Saved answers ("quick replies"): staff type "/office" in the reply box and the saved text is
// inserted. Anyone signed in can use them; only admins create, edit or delete them.

export type QuickReplyResult = { ok: true } | { ok: false; error: string };

export const MAX_BODY = 2000; // the longest message the inbox can send
export const MAX_QUICK_REPLIES = 200;
const SHORTCUT = /^[a-z0-9_-]{1,30}$/;

const q = schema.quickReplies;
const fail = (error: string) => ({ ok: false as const, error });

/** "/Office " -> "office" (what is stored); anything not matching the allowed pattern -> null. */
export function normalizeShortcut(input: string): string | null {
  const s = input.trim().replace(/^\/+/, "").toLowerCase();
  return SHORTCUT.test(s) ? s : null;
}

export async function listQuickReplies(db: Db): Promise<QuickReply[]> {
  return db.select({ id: q.id, shortcut: q.shortcut, body: q.body }).from(q).orderBy(asc(q.shortcut)).limit(MAX_QUICK_REPLIES);
}

export async function addQuickReply(db: Db, input: { shortcut: string; body: string }): Promise<QuickReplyResult> {
  const shortcut = normalizeShortcut(input.shortcut);
  const body = input.body.trim();
  if (!shortcut) return fail("শর্টকাট ১–৩০ অক্ষরের হতে হবে: ছোট হাতের ইংরেজি অক্ষর, সংখ্যা, - বা _।");
  if (!body || body.length > MAX_BODY) return fail("উত্তর ১ থেকে ২০০০ অক্ষরের মধ্যে হতে হবে।");
  const existing = await db.select({ id: q.id }).from(q);
  if (existing.length >= MAX_QUICK_REPLIES) return fail("সর্বোচ্চ ২০০টি দ্রুত উত্তর রাখা যায়।");
  const [dup] = await db.select({ id: q.id }).from(q).where(eq(q.shortcut, shortcut)).limit(1);
  if (dup) return fail("এই শর্টকাট আগেই আছে।");
  await db.insert(q).values({ shortcut, body });
  return { ok: true };
}

export async function updateQuickReply(db: Db, id: string, input: { shortcut: string; body: string }): Promise<QuickReplyResult> {
  const shortcut = normalizeShortcut(input.shortcut);
  const body = input.body.trim();
  if (!shortcut) return fail("শর্টকাট ১–৩০ অক্ষরের হতে হবে: ছোট হাতের ইংরেজি অক্ষর, সংখ্যা, - বা _।");
  if (!body || body.length > MAX_BODY) return fail("উত্তর ১ থেকে ২০০০ অক্ষরের মধ্যে হতে হবে।");
  const [dup] = await db.select({ id: q.id }).from(q).where(eq(q.shortcut, shortcut)).limit(1);
  if (dup && dup.id !== id) return fail("এই শর্টকাট আগেই আছে।");
  const done = await db.update(q).set({ shortcut, body, updatedAt: new Date() }).where(eq(q.id, id)).returning({ id: q.id });
  return done.length ? { ok: true } : fail("দ্রুত উত্তর পাওয়া যায়নি।");
}

export async function deleteQuickReply(db: Db, id: string): Promise<QuickReplyResult> {
  const done = await db.delete(q).where(eq(q.id, id)).returning({ id: q.id });
  return done.length ? { ok: true } : fail("দ্রুত উত্তর পাওয়া যায়নি।");
}
