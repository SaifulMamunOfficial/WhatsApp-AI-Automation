import type { SendResult, SendTextInput } from "../types";

export class MessengerSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = "MessengerSendError";
  }
}

export interface MessengerSenderOptions {
  graphVersion?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Sends a text message through the Send API as the Page.
 *
 * - Default: messaging_type RESPONSE, valid within 24h of the customer's last message.
 * - `humanAgent: true`: MESSAGE_TAG + HUMAN_AGENT, valid up to 7 days, and ONLY for a
 *   real person's reply. The bot must never set this flag (callers enforce it).
 *
 * The Page token is sent in the Authorization header, never in the URL, so it cannot
 * end up in access logs or error messages.
 */
export async function sendMessengerText(
  input: SendTextInput,
  opts: MessengerSenderOptions = {},
): Promise<SendResult> {
  const version = opts.graphVersion ?? process.env.META_GRAPH_VERSION ?? "v23.0";
  const doFetch = opts.fetchImpl ?? fetch;

  const body: Record<string, unknown> = {
    recipient: { id: input.to },
    message: { text: input.text },
    ...(input.humanAgent
      ? { messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" }
      : { messaging_type: "RESPONSE" }),
  };

  const res = await doFetch(`https://graph.facebook.com/${version}/${encodeURIComponent(input.channelExternalId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  const data = (json ?? {}) as {
    message_id?: string;
    error?: { message?: string; code?: number; error_subcode?: number };
  };

  if (!res.ok) {
    throw new MessengerSendError(
      data.error?.message ?? `Messenger send failed with HTTP ${res.status}`,
      res.status,
      data.error?.code,
      data.error?.error_subcode,
    );
  }
  if (!data.message_id) throw new MessengerSendError("Messenger response had no message_id", res.status);
  return { externalId: data.message_id };
}
