import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import { aiConfig, DEFAULT_HANDOFF_TEXT } from "@/core/automation/config";
import type { Db } from "@/core/inbox/ingest";

// Admin-side changes to the knowledge base and the AI bot switch.

export type AdminResult = { ok: true } | { ok: false; error: string };

const article = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(4000),
});
const BAD_ARTICLE = "শিরোনাম (সর্বোচ্চ ২০০) ও বিষয়বস্তু (সর্বোচ্চ ৪০০০ অক্ষর) দিতে হবে।";

export async function addArticle(db: Db, input: { title: string; content: string }): Promise<AdminResult> {
  const p = article.safeParse(input);
  if (!p.success) return { ok: false, error: BAD_ARTICLE };
  await db.insert(schema.knowledgeBase).values(p.data);
  return { ok: true };
}

export async function updateArticle(db: Db, id: string, input: { title: string; content: string }): Promise<AdminResult> {
  const p = article.safeParse(input);
  if (!p.success) return { ok: false, error: BAD_ARTICLE };
  const k = schema.knowledgeBase;
  const done = await db.update(k).set({ ...p.data, updatedAt: new Date() }).where(eq(k.id, id)).returning({ id: k.id });
  return done.length ? { ok: true } : { ok: false, error: "লেখা পাওয়া যায়নি।" };
}

export async function deleteArticle(db: Db, id: string): Promise<AdminResult> {
  const k = schema.knowledgeBase;
  const done = await db.delete(k).where(eq(k.id, id)).returning({ id: k.id });
  return done.length ? { ok: true } : { ok: false, error: "লেখা পাওয়া যায়নি।" };
}

export async function setArticleEnabled(db: Db, id: string, enabled: boolean): Promise<AdminResult> {
  const k = schema.knowledgeBase;
  const done = await db.update(k).set({ enabled, updatedAt: new Date() }).where(eq(k.id, id)).returning({ id: k.id });
  return done.length ? { ok: true } : { ok: false, error: "লেখা পাওয়া যায়নি।" };
}

/** The AI bot is one global automation row (kind "ai"); `enabled` is the on/off switch. */
export async function saveAiSettings(
  db: Db,
  input: { enabled: boolean; handoffText?: string; maxRepliesPerHour?: number },
): Promise<AdminResult> {
  const parsed = aiConfig.safeParse({
    handoffText: input.handoffText?.trim() || DEFAULT_HANDOFF_TEXT,
    maxRepliesPerHour: input.maxRepliesPerHour ?? 6,
  });
  if (!parsed.success) return { ok: false, error: "হ্যান্ডঅফ বার্তা (১–১০০০ অক্ষর) ও ঘণ্টায় সর্বোচ্চ উত্তর (১–৬০) ঠিক দিন।" };

  const a = schema.automations;
  const [existing] = await db.select({ id: a.id }).from(a).where(and(eq(a.kind, "ai"), isNull(a.channelId))).limit(1);
  if (existing) {
    await db.update(a).set({ config: parsed.data, enabled: input.enabled, updatedAt: new Date() }).where(eq(a.id, existing.id));
  } else {
    // Priority 50: after keyword rules (which are checked first by kind anyway).
    await db.insert(a).values({ kind: "ai", name: "AI bot", priority: 50, config: parsed.data, enabled: input.enabled });
  }
  return { ok: true };
}
