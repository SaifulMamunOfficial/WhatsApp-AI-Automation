import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { publishInboxEvent } from "@/core/inbox/events";
import { downloadMedia, type DownloadOutcome } from "./download";

/** Downloads one file and tells open inboxes the conversation changed (so the picture appears). */
export async function downloadAndNotify(mediaId: string): Promise<DownloadOutcome> {
  const outcome = await downloadMedia(db, mediaId);
  if (outcome === "skipped") return outcome;
  const [row] = await db
    .select({ conversationId: schema.messages.conversationId })
    .from(schema.messageMedia)
    .innerJoin(schema.messages, eq(schema.messages.id, schema.messageMedia.messageId))
    .where(eq(schema.messageMedia.id, mediaId))
    .limit(1);
  if (row) publishInboxEvent({ type: "conversation", conversationId: row.conversationId });
  return outcome;
}
