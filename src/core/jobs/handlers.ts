import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getAdapter } from "@/channels/registry";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { runAutomationForMessage, type RunDeps } from "@/core/automation/run";
import type { Db } from "@/core/inbox/ingest";
import { downloadAndNotify } from "@/core/media/notify";
import type { Handlers } from "./queue";

// What the worker does for each kind of job. A handler that THROWS is retried by the queue
// (after a growing delay); one that returns normally is finished.

export const AUTOMATION_QUEUE = "automation";
export const MEDIA_QUEUE = "media";

const automationPayload = z.object({ conversationId: z.uuid(), messageExternalId: z.string().min(1) });
const mediaPayload = z.object({ mediaId: z.uuid() });

/**
 * True when the bot already answered this customer message. A job that crashed after sending the
 * reply but before being marked done runs again; this stops the customer getting the reply twice.
 */
export async function botAlreadyReplied(db: Db, conversationId: string, messageExternalId: string): Promise<boolean> {
  const m = schema.messages;
  const [msg] = await db.select({ sentAt: m.sentAt }).from(m).where(and(eq(m.conversationId, conversationId), eq(m.externalId, messageExternalId))).limit(1);
  if (!msg) return false;
  const [reply] = await db.select({ id: m.id }).from(m).where(and(eq(m.conversationId, conversationId), eq(m.sentByBot, true), gte(m.sentAt, msg.sentAt))).limit(1);
  return !!reply;
}

export function automationHandler(database: Db = db, deps: RunDeps = { send: { adapterFor: getAdapter } }, log: (msg: string, err?: unknown) => void = (m, e) => console.error(`[automation] ${m}`, e)) {
  return async (payload: unknown): Promise<void> => {
    const p = automationPayload.safeParse(payload);
    if (!p.success) return; // malformed: retrying cannot fix it
    if (await botAlreadyReplied(database, p.data.conversationId, p.data.messageExternalId)) return;
    // A thrown error here (database trouble, a crash) is retried. A reply that Meta refuses is not:
    // that is recorded on the message itself and retrying a send could double-reply.
    const r = await runAutomationForMessage(database, deps, p.data);
    if ("sent" in r && r.sent && !r.sent.ok) log(`automation reply not sent (${r.sent.code}): ${r.sent.error}`);
    if ("ai" in r && r.ai?.kind === "error") log(`AI failed: ${r.ai.error}`);
  };
}

export function mediaHandler(download: (mediaId: string) => Promise<"ready" | "failed" | "skipped"> = downloadAndNotify) {
  return async (payload: unknown): Promise<void> => {
    const p = mediaPayload.safeParse(payload);
    if (!p.success) return;
    // "failed" is usually a temporary network problem: throw so the queue tries again later.
    // After the last attempt the file stays marked failed and staff can press "Try again".
    if ((await download(p.data.mediaId)) === "failed") throw new Error("media download failed");
  };
}

export function defaultHandlers(): Handlers {
  return { [AUTOMATION_QUEUE]: automationHandler(), [MEDIA_QUEUE]: mediaHandler() };
}
