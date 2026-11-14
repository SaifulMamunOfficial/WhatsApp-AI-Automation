import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { getActiveProvider, listProviderStatus, removeProviderKey, saveProvider, testProvider } from "@/core/ai/config";
import { geminiProvider } from "@/core/ai/providers";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "a".repeat(64);
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());
beforeEach(async () => {
  await t.db.delete(schema.aiProviderSettings);
});

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

describe("provider settings", () => {
  it("stores the key encrypted and shows only the last 4 characters", async () => {
    expect((await saveProvider(t.db, { provider: "openai", apiKey: "sk-secret-abcd1234", makeActive: true })).ok).toBe(true);
    const [row] = await t.db.select().from(schema.aiProviderSettings);
    expect(row.apiKeyEncrypted).toMatch(/^v1:/);
    expect(row.apiKeyEncrypted).not.toContain("secret");
    const s = (await listProviderStatus(t.db, {})).find((x) => x.provider === "openai")!;
    expect(s).toMatchObject({ hasKey: true, keyHint: "1234", active: true });
    expect(JSON.stringify(await listProviderStatus(t.db, {}))).not.toContain("sk-secret");
  });

  it("a blank key keeps the saved one; a new key replaces it", async () => {
    await saveProvider(t.db, { provider: "gemini", apiKey: "gem-key-0000aaaa" });
    await saveProvider(t.db, { provider: "gemini", apiKey: "", model: "gemini-x" });
    let s = (await listProviderStatus(t.db, {})).find((x) => x.provider === "gemini")!;
    expect(s).toMatchObject({ hasKey: true, keyHint: "aaaa", model: "gemini-x" });
    await saveProvider(t.db, { provider: "gemini", apiKey: "gem-key-0000bbbb" });
    s = (await listProviderStatus(t.db, {})).find((x) => x.provider === "gemini")!;
    expect(s.keyHint).toBe("bbbb");
  });

  it("only one provider is active at a time", async () => {
    await saveProvider(t.db, { provider: "anthropic", apiKey: "ant-key-11112222", makeActive: true });
    await saveProvider(t.db, { provider: "openai", apiKey: "oai-key-33334444", makeActive: true });
    const active = (await listProviderStatus(t.db, {})).filter((s) => s.active).map((s) => s.provider);
    expect(active).toEqual(["openai"]);
  });

  it("rejects bad input", async () => {
    expect((await saveProvider(t.db, { provider: "nope", apiKey: "abcdefghij" })).ok).toBe(false);
    expect((await saveProvider(t.db, { provider: "openai", apiKey: "short" })).ok).toBe(false);
    expect((await saveProvider(t.db, { provider: "openai", apiKey: "has a space inside" })).ok).toBe(false);
    expect((await saveProvider(t.db, { provider: "openai", model: "bad model" })).ok).toBe(false);
    expect((await saveProvider(t.db, { provider: "openai", makeActive: true })).ok).toBe(false); // no key yet
  });

  it("removing a key also switches the provider off", async () => {
    await saveProvider(t.db, { provider: "openai", apiKey: "oai-key-33334444", makeActive: true });
    await removeProviderKey(t.db, "openai");
    const s = (await listProviderStatus(t.db, {})).find((x) => x.provider === "openai")!;
    expect(s).toMatchObject({ hasKey: false, active: false });
  });
});

describe("getActiveProvider", () => {
  it("uses the active database provider, with its model", async () => {
    await saveProvider(t.db, { provider: "gemini", apiKey: "gem-key-0000aaaa", model: "gemini-test", makeActive: true });
    const fetchImpl = ok({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] });
    const p = await getActiveProvider(t.db, {}, fetchImpl as unknown as typeof fetch);
    expect(p?.name).toBe("gemini");
    await p!.complete({ system: "s", turns: [{ role: "user", content: "hi" }], maxTokens: 10 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/models/gemini-test:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("gem-key-0000aaaa");
    expect(url).not.toContain("gem-key"); // the key is never in the URL
  });

  it("falls back to the .env key when nothing is active in the database", async () => {
    const p = await getActiveProvider(t.db, { ANTHROPIC_API_KEY: "env-key-12345678" });
    expect(p?.name).toBe("anthropic");
  });

  it("is null with no key anywhere", async () => {
    expect(await getActiveProvider(t.db, {})).toBeNull();
  });
});

describe("testProvider", () => {
  it("reports success when the provider answers", async () => {
    await saveProvider(t.db, { provider: "openai", apiKey: "oai-key-33334444" });
    const r = await testProvider(t.db, "openai", {}, ok({ choices: [{ message: { content: '{"ok":true}' } }] }) as unknown as typeof fetch);
    expect(r.ok).toBe(true);
  });

  it("reports the provider's error without leaking the key", async () => {
    await saveProvider(t.db, { provider: "openai", apiKey: "oai-key-33334444" });
    const bad = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Incorrect API key provided" } }), { status: 401 }));
    const r = await testProvider(t.db, "openai", {}, bad as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain("Incorrect API key");
    expect(JSON.stringify(r)).not.toContain("oai-key-33334444");
  });

  it("fails clearly when there is no key", async () => {
    expect((await testProvider(t.db, "gemini", {})).ok).toBe(false);
  });
});

describe("geminiProvider", () => {
  it("maps roles (assistant becomes model) and reads the text parts", async () => {
    const f = ok({ candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }] } }] });
    const p = geminiProvider({ apiKey: "k-12345678", model: "m", fetchImpl: f as unknown as typeof fetch });
    const out = await p.complete({ system: "sys", turns: [{ role: "user", content: "q" }, { role: "assistant", content: "r" }], maxTokens: 5 });
    expect(out).toBe("ab");
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(["user", "model"]);
    expect(body.systemInstruction.parts[0].text).toBe("sys");
  });
});
