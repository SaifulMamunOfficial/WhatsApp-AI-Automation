// Runs once when the server starts. It starts the background job worker (bot replies, AI answers
// and file downloads that must survive a restart). Only in the Node.js runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startJobWorker } = await import("./core/jobs/start");
  startJobWorker();
}
