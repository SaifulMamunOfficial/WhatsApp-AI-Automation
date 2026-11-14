import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { aiProviderFromEnv, buildProvider, DEFAULT_MODEL, type AiProvider, type AiProviderName } from "./providers";

// Where the AI bot gets its API key: the admin's "Configuration" page (keys encrypted in the
// database) first, then the server's .env as a fallback. Keys never go back to the browser.

export const AI_PROVIDERS: AiProviderName[] = ["anthropic", "openai", "gemini"];
export const isProviderName = (v: unknown): v is AiProviderName => AI_PROVIDERS.includes(v as AiProviderName);

export type ConfigResult = { ok: true } | { ok: false; error: string };

export interface ProviderStatus {
  provider: AiProviderName;
  /** A key is saved in the database. */
  hasKey: boolean;
  /** Last 4 characters of the saved key, for recognition ("…a1b2"). */
  keyHint: string | null;
  /** The server's .env has a key for this provider. */
  envKey: boolean;
  model: string | null;
  defaultModel: string;
  active: boolean;
}

const ENV_KEY: Record<AiProviderName, string> = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" };

function hint(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return decryptSecret(encrypted).slice(-4);
  } catch {
    return null;
  }
}

export async function listProviderStatus(db: Db, env: Record<string, string | undefined> = process.env): Promise<ProviderStatus[]> {
  const rows = await db.select().from(schema.aiProviderSettings);
  const byName = new Map(rows.map((r) => [r.provider, r]));
  return AI_PROVIDERS.map((p) => {
    const r = byName.get(p);
    return {
      provider: p,
      hasKey: !!r?.apiKeyEncrypted,
      keyHint: hint(r?.apiKeyEncrypted ?? null),
      envKey: !!env[ENV_KEY[p]],
      model: r?.model ?? null,
      defaultModel: DEFAULT_MODEL[p],
      active: !!r?.active,
    };
  });
}

/**
 * Saves one provider. A blank `apiKey` keeps the key already saved (so the form can be re-saved
 * without retyping it). `makeActive` makes this the one provider the bot uses.
 */
export async function saveProvider(
  db: Db,
  input: { provider: string; apiKey?: string; model?: string; makeActive?: boolean },
): Promise<ConfigResult> {
  if (!isProviderName(input.provider)) return { ok: false, error: "অজানা AI provider।" };
  const apiKey = (input.apiKey ?? "").trim();
  const model = (input.model ?? "").trim();
  if (apiKey && (apiKey.length < 8 || apiKey.length > 500 || /\s/.test(apiKey))) return { ok: false, error: "API key ঠিক নয় (ফাঁকা ছাড়া ৮–৫০০ অক্ষর)।" };
  if (model.length > 100 || /\s/.test(model)) return { ok: false, error: "মডেলের নাম ঠিক নয়।" };

  const s = schema.aiProviderSettings;
  const [existing] = await db.select().from(s).where(eq(s.provider, input.provider)).limit(1);
  let encrypted = existing?.apiKeyEncrypted ?? null;
  if (apiKey) {
    try {
      encrypted = encryptSecret(apiKey);
    } catch {
      return { ok: false, error: "সার্ভারে ENCRYPTION_KEY সেট করা নেই, তাই key সেভ করা যায়নি।" };
    }
  }
  if (input.makeActive && !encrypted) return { ok: false, error: "আগে একটা API key দিন, তারপর এই provider চালু করুন।" };

  await db.transaction(async (tx) => {
    if (input.makeActive) await tx.update(s).set({ active: false });
    await tx
      .insert(s)
      .values({ provider: input.provider, apiKeyEncrypted: encrypted, model: model || null, active: !!input.makeActive })
      .onConflictDoUpdate({
        target: s.provider,
        set: { apiKeyEncrypted: encrypted, model: model || null, ...(input.makeActive ? { active: true } : {}), updatedAt: new Date() },
      });
  });
  return { ok: true };
}

export async function removeProviderKey(db: Db, provider: string): Promise<ConfigResult> {
  if (!isProviderName(provider)) return { ok: false, error: "অজানা AI provider।" };
  const s = schema.aiProviderSettings;
  await db.update(s).set({ apiKeyEncrypted: null, active: false, updatedAt: new Date() }).where(eq(s.provider, provider));
  return { ok: true };
}

/** The provider the bot should use: the active one saved in the database, else the .env fallback, else null. */
export async function getActiveProvider(
  db: Db,
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch,
): Promise<AiProvider | null> {
  const s = schema.aiProviderSettings;
  const [row] = await db.select().from(s).where(eq(s.active, true)).limit(1);
  if (row?.apiKeyEncrypted && isProviderName(row.provider)) {
    try {
      return buildProvider(row.provider, { apiKey: decryptSecret(row.apiKeyEncrypted), model: row.model || DEFAULT_MODEL[row.provider], fetchImpl });
    } catch {
      // Unreadable key (ENCRYPTION_KEY changed): fall through to .env rather than break the bot.
    }
  }
  return aiProviderFromEnv(env, fetchImpl);
}

/** Sends a tiny request with the saved key (or the .env key) to check that it works. */
export async function testProvider(
  db: Db,
  provider: string,
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch,
): Promise<ConfigResult> {
  if (!isProviderName(provider)) return { ok: false, error: "অজানা AI provider।" };
  const s = schema.aiProviderSettings;
  const [row] = await db.select().from(s).where(eq(s.provider, provider)).limit(1);
  let apiKey: string | undefined;
  if (row?.apiKeyEncrypted) {
    try {
      apiKey = decryptSecret(row.apiKeyEncrypted);
    } catch {
      return { ok: false, error: "সেভ করা key পড়া যায়নি; আবার key দিন।" };
    }
  } else {
    apiKey = env[ENV_KEY[provider]];
  }
  if (!apiKey) return { ok: false, error: "এই provider-এর কোনো API key নেই।" };
  try {
    const ai = buildProvider(provider, { apiKey, model: row?.model || DEFAULT_MODEL[provider], fetchImpl, timeoutMs: 20_000 });
    await ai.complete({ system: 'Reply with the JSON {"ok":true}', turns: [{ role: "user", content: "ping" }], maxTokens: 20 });
    return { ok: true };
  } catch (err) {
    // The provider error never contains the key (see providers.ts).
    return { ok: false, error: `পরীক্ষা ব্যর্থ: ${err instanceof Error ? err.message : "অজানা ত্রুটি"}` };
  }
}
