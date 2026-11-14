import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";
import { decryptSecret } from "@/lib/crypto";
import { MAX_MEDIA_BYTES, saveMedia } from "./storage";
import { baseMime, kindOf } from "./types";

// Downloads a customer's file from Meta once and stores it on our disk, because the provider
// links expire within minutes. Runs after the webhook has already answered 200. Safe to run twice
// for the same row (a conditional update "claims" it) and safe to retry after a failure.

export interface DownloadDeps {
  fetchImpl?: typeof fetch;
  dir?: string;
  graphVersion?: string;
}

export type DownloadOutcome = "ready" | "failed" | "skipped";

const STALE_CLAIM_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 30_000;

class MediaError extends Error {}

/** Only https links to real hostnames: never an IP address, localhost or an internal name. */
export function isSafeDownloadUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
  return !(h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost"));
}

/** Magic-number check for the types where a wrong file would be dangerous or confusing. */
export function looksLike(mime: string, b: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  switch (mime) {
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47);
    case "image/gif":
      return starts(0x47, 0x49, 0x46, 0x38);
    case "image/webp":
      return starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
    case "application/pdf":
      return starts(0x25, 0x50, 0x44, 0x46);
    default:
      return true;
  }
}

async function getJson(url: string, token: string, f: typeof fetch): Promise<Record<string, unknown>> {
  const res = await f(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new MediaError(`HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Reads the body but stops (and fails) once it grows past the limit, whatever Content-Length says. */
async function readLimited(res: Response): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_MEDIA_BYTES) throw new MediaError("ফাইল খুব বড়");
  if (!res.body) throw new MediaError("খালি উত্তর");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_MEDIA_BYTES) {
      await reader.cancel();
      throw new MediaError("ফাইল খুব বড়");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

export async function downloadMedia(db: Db, mediaId: string, deps: DownloadDeps = {}): Promise<DownloadOutcome> {
  const f = deps.fetchImpl ?? fetch;
  const version = deps.graphVersion ?? process.env.META_GRAPH_VERSION ?? "v23.0";
  const m = schema.messageMedia;

  // Claim: only a pending/failed row, or one stuck "downloading" for minutes, may be taken.
  const stale = new Date(Date.now() - STALE_CLAIM_MS);
  const [row] = await db
    .update(m)
    .set({ status: "downloading", attempts: sql`${m.attempts} + 1`, updatedAt: new Date() })
    .where(and(eq(m.id, mediaId), or(inArray(m.status, ["pending", "failed"]), and(eq(m.status, "downloading"), lt(m.updatedAt, stale)))))
    .returning();
  if (!row) return "skipped";

  const fail = async (reason: string): Promise<DownloadOutcome> => {
    await db.update(m).set({ status: "failed", error: `ফাইল নামানো যায়নি: ${reason}`.slice(0, 300), updatedAt: new Date() }).where(eq(m.id, mediaId));
    return "failed";
  };

  try {
    let url = row.ref;
    let hintedMime = row.mimeType;
    let headers: Record<string, string> = {};

    if (row.refKind === "whatsapp_id") {
      const [ch] = await db
        .select({ token: schema.channels.accessTokenEncrypted })
        .from(schema.messages)
        .innerJoin(schema.channels, eq(schema.channels.id, schema.messages.channelId))
        .where(eq(schema.messages.id, row.messageId))
        .limit(1);
      if (!ch?.token) throw new MediaError("চ্যানেলের টোকেন নেই");
      const token = decryptSecret(ch.token);
      const info = await getJson(`https://graph.facebook.com/${version}/${encodeURIComponent(row.ref)}`, token, f);
      if (typeof info.url !== "string") throw new MediaError("Meta ফাইলের লিংক দেয়নি");
      url = info.url;
      hintedMime = typeof info.mime_type === "string" ? info.mime_type : hintedMime;
      headers = { Authorization: `Bearer ${token}` };
    }

    if (!isSafeDownloadUrl(url)) throw new MediaError("লিংকটা নিরাপদ নয়");
    const res = await f(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
    if (!res.ok) throw new MediaError(`HTTP ${res.status}`);

    // Prefer what the file server says it is; fall back to what the webhook / media lookup said.
    const kind = kindOf(res.headers.get("content-type")) ?? kindOf(hintedMime);
    const mime = kindOf(res.headers.get("content-type")) ? baseMime(res.headers.get("content-type")) : baseMime(hintedMime);
    if (!kind || !mime) throw new MediaError("এই ধরনের ফাইল রাখা হয় না");

    const bytes = await readLimited(res);
    if (bytes.byteLength === 0) throw new MediaError("খালি ফাইল");
    if (!looksLike(mime, bytes)) throw new MediaError("ফাইলের ধরন মেলেনি");

    const key = await saveMedia(bytes, kind.ext, deps.dir);
    await db
      .update(m)
      .set({ status: "ready", storageKey: key, mimeType: mime, sizeBytes: bytes.byteLength, error: null, updatedAt: new Date() })
      .where(eq(m.id, mediaId));
    return "ready";
  } catch (err) {
    // Never put the token, the link or the response body in the stored reason.
    return fail(err instanceof MediaError ? err.message : "অজানা ত্রুটি");
  }
}
