// Meta Graph API calls for WhatsApp Coexistence onboarding (Embedded Signup for existing
// WhatsApp Business App numbers).
//
// ⚠ There is intentionally NO function here that calls `POST /{phone_number_id}/register`.
// Registering a number through the Cloud API moves it OFF the Business App, which is
// exactly what Coexistence exists to avoid (see CLAUDE.md). tests/coexistence-api.test.ts
// asserts that no code path in the onboarding flow ever requests a /register URL.

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export interface CoexistenceApiOptions {
  graphVersion?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export interface PhoneNumberInfo {
  id: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  /** true only for a number that is still in use by the WhatsApp Business App. */
  isOnBizApp?: boolean;
  platformType?: string;
}

export type SyncType = "smb_app_state_sync" | "history";

const base = (o: CoexistenceApiOptions) =>
  `https://graph.facebook.com/${o.graphVersion ?? process.env.META_GRAPH_VERSION ?? "v23.0"}`;

async function call<T>(
  url: string,
  init: RequestInit,
  o: CoexistenceApiOptions,
  describe: string,
): Promise<T> {
  const res = await (o.fetchImpl ?? fetch)(url, init);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  const body = (json ?? {}) as { error?: { message?: string; code?: number } };
  if (!res.ok) {
    // Never include the URL (it can carry the app secret) or tokens in errors.
    throw new MetaApiError(body.error?.message ?? `${describe} failed with HTTP ${res.status}`, res.status, body.error?.code);
  }
  return body as T;
}

const bearer = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` });

/**
 * Exchanges the code returned by Embedded Signup (FB.login) for the customer's business
 * token. The code expires 30 seconds after it is issued, so do this first and immediately.
 */
export async function exchangeCodeForToken(
  code: string,
  creds: { appId: string; appSecret: string },
  o: CoexistenceApiOptions = {},
): Promise<string> {
  const qs = new URLSearchParams({ client_id: creds.appId, client_secret: creds.appSecret, code });
  const r = await call<{ access_token?: string }>(`${base(o)}/oauth/access_token?${qs}`, { method: "GET" }, o, "Token exchange");
  if (!r.access_token) throw new MetaApiError("Token exchange returned no access_token", 200);
  return r.access_token;
}

export async function getPhoneNumber(phoneNumberId: string, token: string, o: CoexistenceApiOptions = {}): Promise<PhoneNumberInfo> {
  const fields = "id,display_phone_number,verified_name,is_on_biz_app,platform_type";
  const r = await call<{
    id?: string;
    display_phone_number?: string;
    verified_name?: string;
    is_on_biz_app?: boolean;
    platform_type?: string;
  }>(`${base(o)}/${encodeURIComponent(phoneNumberId)}?fields=${fields}`, { method: "GET", headers: bearer(token) }, o, "Phone number lookup");
  return {
    id: r.id ?? phoneNumberId,
    displayPhoneNumber: r.display_phone_number,
    verifiedName: r.verified_name,
    isOnBizApp: r.is_on_biz_app,
    platformType: r.platform_type,
  };
}

export async function listWabaPhoneNumbers(wabaId: string, token: string, o: CoexistenceApiOptions = {}): Promise<{ id: string }[]> {
  const r = await call<{ data?: { id: string }[] }>(
    `${base(o)}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id`,
    { method: "GET", headers: bearer(token) },
    o,
    "Phone number listing",
  );
  return r.data ?? [];
}

/** Subscribes our app to the customer's WABA so its webhooks (messages, history, echoes...) reach us. */
export async function subscribeApp(wabaId: string, token: string, o: CoexistenceApiOptions = {}): Promise<void> {
  const r = await call<{ success?: boolean }>(
    `${base(o)}/${encodeURIComponent(wabaId)}/subscribed_apps`,
    { method: "POST", headers: bearer(token) },
    o,
    "Webhook subscription",
  );
  if (r.success === false) throw new MetaApiError("Webhook subscription was not accepted", 200);
}

/**
 * Asks Meta to send the Business App's contacts (`smb_app_state_sync`) or chat history
 * (`history`). Each can be requested only ONCE per onboarding, within 24 hours of it.
 * Returns Meta's request_id (keep it for support).
 */
export async function requestSync(
  phoneNumberId: string,
  syncType: SyncType,
  token: string,
  o: CoexistenceApiOptions = {},
): Promise<string> {
  const r = await call<{ request_id?: string }>(
    `${base(o)}/${encodeURIComponent(phoneNumberId)}/smb_app_data`,
    {
      method: "POST",
      headers: { ...bearer(token), "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
    },
    o,
    `Sync request (${syncType})`,
  );
  return r.request_id ?? "";
}
