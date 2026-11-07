import { EventEmitter } from "node:events";

// In-process event bus feeding the SSE stream. The CRM runs as one Node process on the
// VPS, so webhooks, server actions and SSE connections share this emitter. If it is ever
// scaled to several instances, replace it with Postgres LISTEN/NOTIFY (same interface).

export interface InboxEvent {
  type: "conversation";
  conversationId: string;
}

const g = globalThis as unknown as { __inboxBus?: EventEmitter };
const bus = (g.__inboxBus ??= new EventEmitter().setMaxListeners(0));

export function publishInboxEvent(event: InboxEvent): void {
  bus.emit("event", event);
}

/** Returns an unsubscribe function. */
export function subscribeInbox(listener: (event: InboxEvent) => void): () => void {
  bus.on("event", listener);
  return () => bus.off("event", listener);
}
