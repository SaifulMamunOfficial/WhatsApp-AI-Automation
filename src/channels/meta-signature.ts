import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies Meta's X-Hub-Signature-256 header ("sha256=<hex>") over the RAW request body,
 * using the App Secret. Shared by the WhatsApp and Messenger webhooks.
 * Always compute over the exact bytes received, never over re-serialized JSON.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined,
): boolean {
  if (!appSecret || !signatureHeader) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;

  const given = Buffer.from(signatureHeader.slice(prefix.length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Helper for tests and tooling: builds a valid header value. */
export function signMetaBody(rawBody: string, appSecret: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
}
