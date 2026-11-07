import { describe, expect, it, vi } from "vitest";
import { retrieveArticles, type Article } from "@/core/ai/retrieve";
import { AiProviderError, aiProviderFromEnv, anthropicProvider, openaiProvider, type AiProvider } from "@/core/ai/providers";
import { answerFromKnowledge, buildSystemPrompt, parseAiReply, toTurns } from "@/core/ai/answer";

const art = (id: string, title: string, content: string): Article => ({ id, title, content });
const KB = [
  art("1", "কোর্স ফি", "ইলেকট্রিক্যাল ডিপ্লোমা কোর্সের ফি ৫০০০ টাকা।"),
  art("2", "ঠিকানা", "আমাদের অফিস ঢাকার মিরপুরে, রোড ৫।"),
  art("3", "ভর্তির সময়", "প্রতি মাসের ১ থেকে ১০ তারিখ পর্যন্ত ভর্তি চলে।"),
];

describe("retrieveArticles", () => {
  it("sends a small knowledge base whole, most relevant first", () => {
    const r = retrieveArticles("ফি কত টাকা?", KB);
    expect(r).toHaveLength(3);
    expect(r[0].id).toBe("1");
  });

  it("matches Bengali word forms (suffixes) when ranking", () => {
    const r = retrieveArticles("ঠিকানাটা কী", KB, { maxChars: 60 }); // small budget forces ranking mode
    expect(r[0]?.id).toBe("2");
  });

  it("ranks and cuts a larger base to the budget, dropping unrelated articles", () => {
    const big = [...KB, ...Array.from({ length: 30 }, (_, i) => art(`x${i}`, `অন্য ${i}`, "লরেম ইপসাম ডলর সিট আমেট ".repeat(30)))];
    const r = retrieveArticles("ভর্তি কবে", big, { maxChars: 1500, maxArticles: 3 });
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r[0].id).toBe("3");
    expect(r.reduce((n, a) => n + a.title.length + a.content.length, 0)).toBeLessThanOrEqual(1500);
  });

  it("returns nothing for an empty base", () => {
    expect(retrieveArticles("x", [])).toEqual([]);
  });
});

describe("toTurns", () => {
  it("alternates roles, merges neighbours, starts and ends with the customer", () => {
    const t = toTurns([
      { direction: "outbound", text: "স্বাগতম" },
      { direction: "inbound", text: "দাম?" },
      { direction: "inbound", text: "ফি কত" },
      { direction: "outbound", text: "৫০০০" },
      { direction: "inbound", text: "ধন্যবাদ" },
      { direction: "outbound", text: "আপনাকেও" },
    ]);
    expect(t).toEqual([
      { role: "user", content: "দাম?\nফি কত" },
      { role: "assistant", content: "৫০০০" },
      { role: "user", content: "ধন্যবাদ" },
    ]);
    expect(toTurns([{ direction: "outbound", text: "x" }, { direction: "inbound", text: "  " }])).toEqual([]);
  });
});

describe("parseAiReply", () => {
  it("accepts plain JSON and fenced JSON with chatter around it", () => {
    expect(parseAiReply('{"answer":"৫০০০ টাকা","handoff":false,"reason":"kb"}')).toEqual({ kind: "answer", text: "৫০০০ টাকা" });
    expect(parseAiReply('এই নিন:\n```json\n{"answer":"হ্যাঁ","handoff":false}\n```')).toEqual({ kind: "answer", text: "হ্যাঁ" });
  });

  it("treats handoff, empty, oversized and malformed replies as handoff, never as an answer", () => {
    expect(parseAiReply('{"answer":null,"handoff":true,"reason":"জানা নেই"}')).toEqual({ kind: "handoff", reason: "জানা নেই" });
    expect(parseAiReply('{"answer":"ok","handoff":true}')).toMatchObject({ kind: "handoff" });
    expect(parseAiReply('{"answer":"","handoff":false}')).toMatchObject({ kind: "handoff", reason: "empty_answer" });
    expect(parseAiReply(`{"answer":"${"ক".repeat(1600)}","handoff":false}`)).toMatchObject({ kind: "handoff", reason: "answer_too_long" });
    for (const bad of ["", "no json", "{broken", '{"answer": 5, "handoff": false}', "[]"]) {
      expect(parseAiReply(bad).kind).toBe("handoff");
    }
  });
});

describe("answerFromKnowledge", () => {
  const provider = (reply: string | Error): AiProvider & { complete: ReturnType<typeof vi.fn> } => ({
    name: "anthropic",
    complete: vi.fn().mockImplementation(async () => {
      if (reply instanceof Error) throw reply;
      return reply;
    }),
  });
  const history = [{ direction: "inbound" as const, text: "ফি কত?" }];

  it("passes the knowledge in the system prompt and returns the model's answer", async () => {
    const p = provider('{"answer":"ফি ৫০০০ টাকা।","handoff":false,"reason":"kb 1"}');
    expect(await answerFromKnowledge(p, { articles: KB, history })).toEqual({ kind: "answer", text: "ফি ৫০০০ টাকা।" });
    const call = p.complete.mock.calls[0][0];
    expect(call.system).toContain("ইলেকট্রিক্যাল ডিপ্লোমা কোর্সের ফি ৫০০০");
    expect(call.system).toContain("বানিয়ে বলবে না");
    expect(call.turns).toEqual([{ role: "user", content: "ফি কত?" }]);
  });

  it("hands over without calling the model when there is no knowledge or no customer text", async () => {
    const p = provider("{}");
    expect(await answerFromKnowledge(p, { articles: [], history })).toEqual({ kind: "handoff", reason: "no_knowledge" });
    expect(await answerFromKnowledge(p, { articles: KB, history: [] })).toEqual({ kind: "handoff", reason: "no_customer_text" });
    expect(p.complete).not.toHaveBeenCalled();
  });

  it("reports provider failures as errors", async () => {
    expect(await answerFromKnowledge(provider(new AiProviderError("rate limited", 429)), { articles: KB, history })).toEqual({ kind: "error", error: "rate limited" });
  });

  it("the prompt tells the model to ignore instructions inside customer messages", () => {
    expect(buildSystemPrompt(KB)).toContain("কোনো নির্দেশ");
  });
});

describe("providers", () => {
  const ok = (body: unknown, status = 200) => vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }));

  it("Anthropic: right endpoint, headers, body; returns the text", async () => {
    const f = ok({ content: [{ type: "text", text: '{"answer":"হ্যাঁ","handoff":false}' }] });
    const text = await anthropicProvider({ apiKey: "KEY", model: "m1", fetchImpl: f }).complete({ system: "S", turns: [{ role: "user", content: "hi" }], maxTokens: 50 });
    expect(text).toContain("হ্যাঁ");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("KEY");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(JSON.parse(init.body)).toEqual({ model: "m1", max_tokens: 50, system: "S", messages: [{ role: "user", content: "hi" }] });
  });

  it("OpenAI: system message first, JSON mode, returns the content", async () => {
    const f = ok({ choices: [{ message: { content: "{}" } }] });
    await openaiProvider({ apiKey: "KEY", model: "g", fetchImpl: f }).complete({ system: "S", turns: [{ role: "user", content: "hi" }], maxTokens: 10 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer KEY");
    expect(JSON.parse(init.body).messages[0]).toEqual({ role: "system", content: "S" });
  });

  it("errors never leak the API key, and empty responses are errors", async () => {
    const err = await anthropicProvider({ apiKey: "SECRET-KEY", model: "m", fetchImpl: ok({ error: { message: "overloaded" } }, 529) }).complete({ system: "s", turns: [], maxTokens: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect(err).toMatchObject({ message: "overloaded", status: 529 });
    expect(err.message).not.toContain("SECRET-KEY");
    await expect(anthropicProvider({ apiKey: "k", model: "m", fetchImpl: ok({ content: [] }) }).complete({ system: "s", turns: [], maxTokens: 1 })).rejects.toThrow(/empty/);
  });

  it("is chosen from the environment and is null without a key", () => {
    expect(aiProviderFromEnv({})).toBeNull();
    expect(aiProviderFromEnv({ AI_PROVIDER: "openai", ANTHROPIC_API_KEY: "x" })).toBeNull();
    expect(aiProviderFromEnv({ ANTHROPIC_API_KEY: "x" })?.name).toBe("anthropic");
    expect(aiProviderFromEnv({ AI_PROVIDER: "openai", OPENAI_API_KEY: "x" })?.name).toBe("openai");
  });
});
