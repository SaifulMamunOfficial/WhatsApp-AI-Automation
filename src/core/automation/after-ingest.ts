import "server-only";
import { after } from "next/server";
import { getAdapter } from "@/channels/registry";
import { db } from "@/db";
import type { IngestResult } from "@/core/inbox/ingest";
import { processNewInbound } from "./run";

/**
 * Called from the webhook routes right after ingestion. The response (200 to Meta) goes out
 * first; the bot runs afterwards via Next's after(). Heavy/retryable work (AI answers) will
 * move to a durable pg-boss queue in step 10; this is enough for instant text rules.
 */
export function scheduleAutomations(result: IngestResult): void {
  if (result.newInbound.length === 0) return;
  const list = result.newInbound;
  after(() => processNewInbound(db, { send: { adapterFor: getAdapter } }, list, (m, e) => console.error(`[automation] ${m}`, e)));
}
