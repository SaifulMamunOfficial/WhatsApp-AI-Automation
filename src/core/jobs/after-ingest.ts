import "server-only";
import { db } from "@/db";
import type { IngestResult } from "@/core/inbox/ingest";
import { scheduleAutomations } from "@/core/automation/after-ingest";
import { scheduleMediaDownloads } from "@/core/media/schedule";
import { enqueueIngestWork } from "./enqueue";
import { nudgeWorker } from "./worker";

/**
 * Called by the webhook routes after the messages are stored. The work is written to the durable
 * queue (one quick insert each), so a restart cannot lose it; the worker then runs it.
 * If the queue itself cannot be written, fall back to running the work right after the response,
 * exactly as before, so a queue problem never silences the bot.
 */
export async function queueAfterIngest(result: IngestResult): Promise<void> {
  if (result.newInbound.length === 0 && result.newMedia.length === 0) return;
  try {
    await enqueueIngestWork(db, result);
    nudgeWorker();
  } catch (err) {
    console.error("[jobs] could not queue work; running it directly", err instanceof Error ? err.message : err);
    scheduleAutomations(result);
    scheduleMediaDownloads(result);
  }
}
