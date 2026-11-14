import "server-only";
import { db } from "@/db";
import { defaultHandlers } from "./handlers";
import { startWorker } from "./worker";

/** Starts the background worker once per server process. Set DISABLE_JOB_WORKER=true to turn it off. */
export function startJobWorker(): void {
  if (process.env.DISABLE_JOB_WORKER === "true") return;
  if (!process.env.DATABASE_URL) return;
  startWorker(db, defaultHandlers());
  console.log("[jobs] background worker started");
}
