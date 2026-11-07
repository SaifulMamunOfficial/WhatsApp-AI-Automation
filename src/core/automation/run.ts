import { and, asc, desc, eq, lt, ne, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";
import { sendReply, type SendDeps, type SendReplyResult } from "@/core/inbox/send";
import { parseAutomation, type Automation } from "./config";
import { decideAutomation, type Decision } from "./engine";
import { officeHoursFromEnv, type OfficeHours } from "./office-hours";

export interface RunDeps {
  send: SendDeps;
  office?: OfficeHours;
  now?: () => Date;
}

export interface NewInbound {
  conversationId: string;
  messageExternalId: string;
}

export type RunResult =
  | { decision: Decision; sent?: SendReplyResult }
  | { decision: { action: "none"; reason: "not_found" } };

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
    return { decision: decideAutomation([], baseCtx(row, 0, null, null, deps)) };
  }

  const rows = await db
    .select()
    .from(schema.automations)
    .where(eq(schema.automations.enabled, true))
    .orderBy(asc(schema.automations.priority));
  const automations = rows.map((r) => parseAutomation({ id: r.id, kind: r.kind, priority: r.priority, channelId: r.channelId, config: r.config })).filter((a): a is Automation => a !== null);

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

  const decision = decideAutomation(automations, baseCtx(row, inboundCount, previous?.at ?? null, lastBot?.at ?? null, deps));
  if (decision.action !== "reply") return { decision };

  const sent = await sendReply(db, deps.send, { conversationId: conversation.id, text: decision.text, sender: "bot" });
  return { decision, sent };
}

function baseCtx(
  row: { message: typeof schema.messages.$inferSelect; conversation: typeof schema.conversations.$inferSelect; channel: typeof schema.channels.$inferSelect },
  inboundCount: number,
  previousActivityAt: Date | null,
  lastBotReplyAt: Date | null,
  deps: RunDeps,
) {
  return {
    channel: { id: row.channel.id, botEnabled: row.channel.botEnabled },
    conversation: { botPaused: row.conversation.botPaused },
    message: { direction: row.message.direction, source: row.message.source, type: row.message.type, text: row.message.body },
    inboundCount,
    previousActivityAt,
    lastBotReplyAt,
    now: deps.now?.() ?? new Date(),
    office: deps.office ?? officeHoursFromEnv(),
  };
}

/** Runs automations for newly stored customer messages. Never throws: a bot failure must not affect anything else. */
export async function processNewInbound(db: Db, deps: RunDeps, list: NewInbound[], log: (msg: string, err?: unknown) => void = () => {}) {
  for (const target of list) {
    try {
      const r = await runAutomationForMessage(db, deps, target);
      if (r.decision.action === "reply" && "sent" in r && r.sent && !r.sent.ok) {
        log(`automation reply not sent (${r.sent.code}): ${r.sent.error}`);
      }
    } catch (err) {
      log("automation failed", err);
    }
  }
}
