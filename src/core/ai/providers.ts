// Minimal AI provider clients over plain fetch (no SDK dependency). The provider only turns
// a system prompt + chat turns into text; all policy lives in answer.ts.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AiProvider {
  readonly name: "anthropic" | "openai";
  complete(input: { system: string; turns: ChatTurn[]; maxTokens: number }): Promise<string>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

interface Opts {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  /** Abort slow calls: a customer is waiting and the webhook already returned. */
  timeoutMs?: number;
}

async function post(url: string, headers: Record<string, string>, body: unknown, o: Opts): Promise<unknown> {
  const res = await (o.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const e = (json as { error?: { message?: string } } | undefined)?.error?.message;
    // Never include the API key or request body in the error.
    throw new AiProviderError(e ?? `AI request failed with HTTP ${res.status}`, res.status);
  }
  return json;
}

export function anthropicProvider(o: Opts): AiProvider {
  return {
    name: "anthropic",
    async complete({ system, turns, maxTokens }) {
      const r = (await post(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": o.apiKey, "anthropic-version": "2023-06-01" },
        { model: o.model, max_tokens: maxTokens, system, messages: turns },
        o,
      )) as { content?: { type: string; text?: string }[] };
      const text = r.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
      if (!text) throw new AiProviderError("AI returned an empty response");
      return text;
    },
  };
}

export function openaiProvider(o: Opts): AiProvider {
  return {
    name: "openai",
    async complete({ system, turns, maxTokens }) {
      const r = (await post(
        "https://api.openai.com/v1/chat/completions",
        { authorization: `Bearer ${o.apiKey}` },
        {
          model: o.model,
          max_tokens: maxTokens,
          messages: [{ role: "system", content: system }, ...turns],
          response_format: { type: "json_object" },
        },
        o,
      )) as { choices?: { message?: { content?: string } }[] };
      const text = r.choices?.[0]?.message?.content ?? "";
      if (!text) throw new AiProviderError("AI returned an empty response");
      return text;
    },
  };
}

const DEFAULT_MODEL = { anthropic: "claude-haiku-5-5", openai: "gpt-4o-mini" } as const;

/** The configured provider, or null when no API key is set (the bot then skips AI). */
export function aiProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: typeof fetch,
): AiProvider | null {
  const which = env.AI_PROVIDER === "openai" ? "openai" : "anthropic";
  const apiKey = which === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = env.AI_MODEL || DEFAULT_MODEL[which];
  return (which === "openai" ? openaiProvider : anthropicProvider)({ apiKey, model, fetchImpl });
}
