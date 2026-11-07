import { createHash, timingSafeEqual } from "node:crypto";
import type { ChannelAdapter, WebhookEvents } from "./types";

// Shared by the WhatsApp and Messenger routes. Kept free of framework and database
// imports so it can be unit tested.

const MAX_BODY_BYTES = 1_000_000;

export interface WebhookDeps {
  adapter: ChannelAdapter;
  /** Persists the parsed events. Must be idempotent. Throwing makes Meta retry. */
  ingest: (events: WebhookEvents) => Promise<unknown>;
  log?: (message: string, err?: unknown) => void;
}

function safeEqual(a: string, b: string): boolean {
  // Hash first so lengths always match and nothing leaks through timing.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** GET handshake: Meta calls this once when you save the webhook URL. */
export function handleVerification(url: URL, verifyToken: string | undefined): Response {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && verifyToken && token && challenge !== null && safeEqual(token, verifyToken)) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** POST delivery: verify signature, parse, store, answer 200 fast. */
export async function handleDelivery(request: Request, deps: WebhookDeps): Promise<Response> {
  const log = deps.log ?? (() => {});

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  // The signature is over the exact raw bytes, so read text before any JSON parsing.
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) return new Response("Payload too large", { status: 413 });

  if (!deps.adapter.verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const events = deps.adapter.parseWebhook(payload);
  const hasWork =
    events.messages.length > 0 ||
    events.statuses.length > 0 ||
    (events.history?.length ?? 0) > 0 ||
    (events.contactSync?.length ?? 0) > 0;
  if (!hasWork) {
    return new Response("OK", { status: 200 }); // nothing we handle (yet); acknowledge so Meta stops retrying
  }

  try {
    await deps.ingest(events);
  } catch (err) {
    // Non-2xx makes Meta redeliver later; ingestion is idempotent so this is safe.
    log("webhook ingest failed", err);
    return new Response("Error", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
