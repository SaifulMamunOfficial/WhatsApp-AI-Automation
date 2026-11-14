import type { Db } from "@/core/inbox/ingest";
import { cleanupJobs, runOnce, type Handlers } from "./queue";

// The loop that runs queued jobs inside the app's own server process. Polls every few seconds and
// can be nudged to look right now (so a new message is answered without waiting for the next poll).
// A global guard keeps ONE loop per process even when the dev server reloads modules.

interface WorkerState {
  timer: ReturnType<typeof setTimeout> | null;
  running: number;
  stopped: boolean;
  nudge: () => void;
}

const KEY = "__crmJobWorker";
const g = globalThis as typeof globalThis & { [KEY]?: WorkerState };

export interface WorkerOptions {
  pollMs?: number;
  concurrency?: number;
  log?: (msg: string, err?: unknown) => void;
}

export function startWorker(db: Db, handlers: Handlers, opts: WorkerOptions = {}): void {
  if (g[KEY] && !g[KEY]!.stopped) return;
  const pollMs = opts.pollMs ?? 2000;
  const concurrency = opts.concurrency ?? 2;
  const log = opts.log ?? ((m, e) => console.error(`[jobs] ${m}`, e));
  const state: WorkerState = { timer: null, running: 0, stopped: false, nudge: () => {} };
  g[KEY] = state;
  let lastCleanup = 0;

  const schedule = (ms: number) => {
    if (state.stopped) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(tick, ms);
    state.timer.unref?.();
  };

  async function lane() {
    // Keep taking jobs until nothing is due.
    for (;;) {
      if (state.stopped) return;
      let didWork = false;
      try {
        didWork = await runOnce(db, handlers, () => new Date(), log);
      } catch (err) {
        log("worker error", err instanceof Error ? err.message : err);
      }
      if (!didWork) return;
    }
  }

  async function tick() {
    state.timer = null;
    if (state.stopped) return;
    const free = concurrency - state.running;
    const lanes = Array.from({ length: Math.max(0, free) }, async () => {
      state.running++;
      try {
        await lane();
      } finally {
        state.running--;
      }
    });
    await Promise.all(lanes);
    // Once an hour, delete old finished jobs.
    if (Date.now() - lastCleanup > 3_600_000) {
      lastCleanup = Date.now();
      try {
        await cleanupJobs(db);
      } catch (err) {
        log("cleanup failed", err instanceof Error ? err.message : err);
      }
    }
    schedule(pollMs);
  }

  state.nudge = () => {
    if (!state.stopped) schedule(0);
  };
  schedule(500);
}

/** Look for work right now (called after a job is added). Does nothing when no worker is running. */
export function nudgeWorker(): void {
  g[KEY]?.nudge();
}

export function stopWorker(): void {
  const s = g[KEY];
  if (!s) return;
  s.stopped = true;
  if (s.timer) clearTimeout(s.timer);
  g[KEY] = undefined;
}
