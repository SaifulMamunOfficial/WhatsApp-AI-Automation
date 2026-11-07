import { and, eq, isNull } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";
import { keywordConfig, officeHoursConfig, welcomeConfig } from "./config";

// Admin-side changes to automation rules and the per-channel bot switch.

export type AdminResult = { ok: true } | { ok: false; error: string };

const DEFAULT_NAMES = { welcome: "স্বাগত মেসেজ", office_hours: "অফিস সময়ের বাইরে" } as const;

/** The welcome message and the after-hours notice: one global row each. */
export async function saveSimpleAutomation(
  db: Db,
  kind: "welcome" | "office_hours",
  text: string,
  enabled: boolean,
): Promise<AdminResult> {
  const parsed = (kind === "welcome" ? welcomeConfig : officeHoursConfig).safeParse({ text });
  if (!parsed.success) return { ok: false, error: "টেক্সট ১ থেকে ১০০০ অক্ষরের মধ্যে হতে হবে।" };
  const clean = parsed.data.text;

  const a = schema.automations;
  const [existing] = await db.select({ id: a.id, config: a.config }).from(a).where(and(eq(a.kind, kind), isNull(a.channelId))).limit(1);
  if (existing) {
    // Keep settings the form does not edit (e.g. the welcome idleHours).
    const merged = { ...(existing.config as object), text: clean };
    await db.update(a).set({ config: merged, enabled, updatedAt: new Date() }).where(eq(a.id, existing.id));
  } else {
    await db.insert(a).values({ kind, name: DEFAULT_NAMES[kind], config: kind === "welcome" ? { text: clean, idleHours: 72 } : { text: clean }, enabled });
  }
  return { ok: true };
}

/** `keywordsCsv`: comma, Bengali comma or newline separated. */
export async function addKeywordRule(
  db: Db,
  input: { name?: string; keywordsCsv: string; reply: string; match: "contains" | "exact" },
): Promise<AdminResult> {
  const keywords = input.keywordsCsv.split(/[,،\n]/).map((k) => k.trim()).filter(Boolean);
  const parsed = keywordConfig.safeParse({ keywords, match: input.match, reply: input.reply });
  if (!parsed.success) return { ok: false, error: "কমপক্ষে একটি keyword ও একটি উত্তর দিন (উত্তর সর্বোচ্চ ১০০০ অক্ষর)।" };

  await db.insert(schema.automations).values({
    kind: "keyword",
    name: (input.name?.trim() || parsed.data.keywords[0]).slice(0, 100),
    // New rules go after existing ones; lower priority number is checked first.
    priority: 100 + (await countKeywordRules(db)),
    config: parsed.data,
  });
  return { ok: true };
}

async function countKeywordRules(db: Db): Promise<number> {
  const rows = await db.select({ id: schema.automations.id }).from(schema.automations).where(eq(schema.automations.kind, "keyword"));
  return rows.length;
}

export async function deleteAutomation(db: Db, id: string): Promise<AdminResult> {
  const gone = await db.delete(schema.automations).where(eq(schema.automations.id, id)).returning({ id: schema.automations.id });
  return gone.length ? { ok: true } : { ok: false, error: "নিয়ম পাওয়া যায়নি।" };
}

export async function setAutomationEnabled(db: Db, id: string, enabled: boolean): Promise<AdminResult> {
  const a = schema.automations;
  const done = await db.update(a).set({ enabled, updatedAt: new Date() }).where(eq(a.id, id)).returning({ id: a.id });
  return done.length ? { ok: true } : { ok: false, error: "নিয়ম পাওয়া যায়নি।" };
}

/**
 * Per-channel master switch. Go-live rule: new real channels start OFF; turn on first
 * out-of-hours only, then fully (docs/META_NOTES.md).
 */
export async function setBotEnabled(db: Db, channelId: string, enabled: boolean): Promise<AdminResult> {
  const c = schema.channels;
  const done = await db.update(c).set({ botEnabled: enabled }).where(eq(c.id, channelId)).returning({ id: c.id });
  return done.length ? { ok: true } : { ok: false, error: "চ্যানেল পাওয়া যায়নি।" };
}
