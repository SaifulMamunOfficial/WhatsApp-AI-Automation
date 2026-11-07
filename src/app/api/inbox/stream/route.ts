import { getCurrentUser } from "@/core/auth/session";
import { subscribeInbox } from "@/core/inbox/events";

// Server-Sent Events: tells open inbox tabs that something changed so they refetch.
// The payload is only a conversation id; the data itself is fetched through the normal
// authenticated page render, so nothing sensitive travels over this stream.

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup(); // controller already closed
        }
      };

      send("retry: 3000\n\n");
      const unsubscribe = subscribeInbox((event) => send(`data: ${JSON.stringify(event)}\n\n`));
      // Comment lines keep proxies and browsers from closing an idle connection.
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // tell nginx not to buffer the stream
    },
  });
}
