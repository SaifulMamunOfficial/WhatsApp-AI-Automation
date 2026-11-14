import "server-only";
import { after } from "next/server";
import type { IngestResult } from "@/core/inbox/ingest";
import { downloadAndNotify } from "./notify";

/**
 * Called from the webhook routes right after ingestion: the 200 goes to Meta first, the files
 * are fetched afterwards. A failure only marks that file as failed (staff can retry from the
 * inbox); it never affects the webhook or the other files.
 */
export function scheduleMediaDownloads(result: IngestResult): void {
  if (result.newMedia.length === 0) return;
  const ids = result.newMedia;
  after(async () => {
    for (const id of ids) {
      try {
        await downloadAndNotify(id);
      } catch (err) {
        console.error("[media] download failed", err instanceof Error ? err.message : "unknown error");
      }
    }
  });
}
