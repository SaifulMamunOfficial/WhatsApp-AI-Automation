import type { IngestResult } from "@/core/inbox/ingest";
import type { Db } from "@/core/inbox/ingest";
import { AUTOMATION_QUEUE, MEDIA_QUEUE } from "./handlers";
import { enqueue } from "./queue";

/** Writes the follow-up work of a webhook delivery to the queue: one job per new customer message and per new file. */
export async function enqueueIngestWork(db: Db, result: Pick<IngestResult, "newInbound" | "newMedia">): Promise<number> {
  for (const m of result.newInbound) await enqueue(db, AUTOMATION_QUEUE, { conversationId: m.conversationId, messageExternalId: m.messageExternalId });
  for (const mediaId of result.newMedia) await enqueue(db, MEDIA_QUEUE, { mediaId }, { maxAttempts: 3 });
  return result.newInbound.length + result.newMedia.length;
}
