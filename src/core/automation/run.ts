import { and, asc, desc, eq, gt, isNotNull, lt, ne, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { answerFromKnowledge, type AnswerResult } from "@/core/ai/answer";
import { aiProviderFromEnv, type AiProvider } from "@/core/ai/providers";
import { retrieveArticles } from "@/core/ai/retrieve";
import { publishInboxEvent } from "@/core/inbox/events";
import type { Db } from "@/core/inbox/ingest";
import { sendReply, type SendDeps, type SendReplyResult } from "@/core/inbox/send";
import { parseAutomation, type Automation } from "./config";
import { decideAutomation, type AutomationContext, type Decision } from "./engine";
import { officeHoursFromEnv, type OfficeHours } from "./office-hours";

export interface RunDeps {
  send: SendDeps;
  office?: OfficeHours;
  now?: () => Date;
  /** AI provider. undefined = from the environment; null = AI unavailable. */
  ai?: AiProvider | null;
}

export interface NewInbound {
  conversationId: string;
  messageExternalId: string;
}

export type AiOutcome = AnswerResult | { kind: "rate_limited" };

export type RunResult =
  | { decision: Decision; sent?: SendReplyResult; ai?: AiOutcome }
  | { decision: { action: "none"; reason: "not_found" } };

const HISTORY_FOR_AI = 10;
const HOUR = 60 * 60 * 1000;

type Row = { message: typeof schema.messages.$inferSelect; conversation: typeof schema.conversations.$inferSelect; channel: typeof schema.channels.$inferSelect };

/** Loads the facts for one stored customer message, decides, and (if due) sends the bot reply. */
export async function runAutomationForMessage(db: Db, deps: RunDeps, target: NewInbound): Promise<RunResult> {
  const [row] = await db
    .select({ message: schema.messages, conversation: schema.conversations, channel: schema.channels })
    .from(schema.messages)
    .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
    .innerJoin(schema.channels, eq(schema.channels.id, schema.messages.channelId))
    .where(and(eq(schema.messages.externalId, target.messageExternalId), eq(schema.messages.conversationId, target.conversationId)))
    .limit(1);
  if (!row) return { decision: { action: "none", reason: "not_found" } };
  const { message, conversation, channel } = row;

  // Cheap exits before touching anything else.
  if (!channel.botEnabled || conversation.botPaused) {
    return { decision: decideAutomation([], baseCtx(row, 0, null, null, deps, false)) };
  }

  const rows = await db
    .select()
    .from(schema.automations)
    .where(eq(schema.automations.enabled, true))
    .orderBy(asc(schema.automations.priority));
  const automations = rows
    .map((r) => parseAutomation({ id: r.id, kind: r.kind, priority: r.priority, channelId: r.channelId, config: r.config }))
    .filter((a): a is Automation => a !== null);

  const m = schema.messages;
  const [{ inboundCount }] = await db
    .select({ inboundCount: sql<number>`count(*)::int` })
    .from(m)
    .where(and(eq(m.conversationId, conversation.id), eq(m.direction, "inbound"), eq(m.source, "api")));
  const [previous] = await db
    .select({ at: m.sentAt })
    .from(m)
    .where(and(eq(m.conversationId, conversation.id), ne(m.id, message.id), lt(m.sentAt, message.sentAt)))
    .orderBy(desc(m.sentAt))
    .limit(1);
  const [lastBot] = await db
    .select({ at: m.sentAt })
    .from(m)
    .where(and(eq(m.conversationId, conversation.id), eq(m.sentByBot, true)))
    .orderBy(desc(m.sentAt))
    .limit(1);

  // AI is only an option when a provider is configured and there is knowledge to ground it.
  const provider = deps.ai !== undefined ? deps.ai : aiProviderFromEnv();
  const articles = provider
    ? await db.select({ id: schema.knowledgeBase.id, title: schema.knowledgeBase.title, content: schema.knowledgeBase.content }).from(schema.knowledgeBase).where(eq(schema.knowledgeBase.enabled, true))
    : [];
  const aiAvailable = !!provider && articles.length > 0;

  const ctx = baseCtx(row, inboundCount, previous?.at ?? null, lastBot?.at ?? null, deps, aiAvailable);
  const decision = decideAutomation(automations, ctx);

  if (decision.action === "ai" && provider) {
    return runAi(db, deps, { row, provider, articles, decision, automations, ctx });
  }
  if (decision.action !== "reply") return { decision };

  const sent = await sendReply(db, deps.send, { conversationId: conversation.id, text: decision.text, sender: "bot" });
  return { decision, sent };
}

async function runAi(
  db: Db,
  deps: RunDeps,
  a: {
    row: Row;
    provider: AiProvider;
    articles: { id: string; title: string; content: string }[];
    decision: Extract<Decision, { action: "ai" }>;
    automations: Automation[];
    ctx: AutomationContext;
  },
): Promise<RunResult> {
  const { row, decision, ctx } = a;
  const conversationId = row.conversation.id;
  const m = schema.messages;
  const now = ctx.now;

  const handoff = async (outcome: AiOutcome): Promise<RunResult> => {
    // A person must take over: flag it, silence the bot here, and tell the customer.
    await markNeedsHuman(db, conversationId, { pauseBot: true });
    const sent = await sendReply(db, deps.send, { conversationId, text: decision.handoffText, sender: "bot" });
    return { decision, sent, ai: outcome };
  };

  // Loop / cost guard.
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(m)
    .where(and(eq(m.conversationId, conversationId), eq(m.sentByBot, true), gt(m.sentAt, new Date(now.getTime() - HOUR))));
  if (n >= decision.maxRepliesPerHour) return handoff({ kind: "rate_limited" });

  const recent = await db
    .select({ direction: m.direction, text: m.body })
    .from(m)
    .where(and(eq(m.conversationId, conversationId), isNotNull(m.body)))
    .orderBy(desc(m.sentAt))
    .limit(HISTORY_FOR_AI);
  const history = recent.reverse().map((r) => ({ direction: r.direction, text: r.text ?? "" }));
  const query = history.filter((h) => h.direction === "inbound").slice(-3).map((h) => h.text).join(" ");

  const result = await answerFromKnowledge(a.provider, { articles: retrieveArticles(query, a.articles), history });

  if (result.kind === "answer") {
    const sent = await sendReply(db, deps.send, { conversationId, text: result.text, sender: "bot" });
    return { decision, sent, ai: result };
  }
  if (result.kind === "handoff") return handoff(result);

  // Provider failure: do not leave the customer unanswered without a trace. Flag it for staff
  // and fall back to the plain rules (after-hours notice / welcome) if one applies.
  await markNeedsHuman(db, conversationId, { pauseBot: false });
  const fallback = decideAutomation(a.automations, { ...ctx, aiAvailable: false });
  if (fallback.action !== "reply") return { decision: fallback, ai: result };
  const sent = await sendReply(db, deps.send, { conversationId, text: fallback.text, sender: "bot" });
  return { decision: fallback, sent, ai: result };
}

async function markNeedsHuman(db: Db, conversationId: string, opts: { pauseBot: boolean }) {
  await db
    .update(schema.conversations)
    .set({ needsHuman: true, status: "open", ...(opts.pauseBot ? { botPaused: true } : {}) })
    .where(eq(schema.conversations.id, conversationId));
  publishInboxEvent({ type: "conversation", conversationId });
}

function baseCtx(row: Row, inboundCount: number, previousActivityAt: Date | null, lastBotReplyAt: Date | null, deps: RunDeps, aiAvailable: boolean): AutomationContext {
  return {
    channel: { id: row.channel.id, botEnabled: row.channel.botEnabled },
    conversation: { botPaused: row.conversation.botPaused },
    message: { direction: row.message.direction, source: row.message.source, type: row.message.type, text: row.message.body },
    inboundCount,
    previousActivityAt,
    lastBotReplyAt,
    now: deps.now?.() ?? new Date(),
    office: deps.office ?? officeHoursFromEnv(),
    aiAvailable,
  };
}

/** Runs automations for newly stored customer messages. Never throws: a bot failure must not affect anything else. */
export async function processNewInbound(db: Db, deps: RunDeps, list: NewInbound[], log: (msg: string, err?: unknown) => void = () => {}) {
  for (const target of list) {
    try {
      const r = await runAutomationForMessage(db, deps, target);
      if ("sent" in r && r.sent && !r.sent.ok) log(`automation reply not sent (${r.sent.code}): ${r.sent.error}`);
      if ("ai" in r && r.ai?.kind === "error") log(`AI failed: ${r.ai.error}`);
    } catch (err) {
      log("automation failed", err);
    }
  }
}
