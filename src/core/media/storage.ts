import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Files live in MEDIA_DIR under random names ("<32 hex>.<ext>"). The database row, not the
// filename, says what the file is. Keys are validated before any disk access so a crafted key can
// never reach outside MEDIA_DIR.

const KEY = /^[0-9a-f]{32}\.[a-z0-9]{1,5}$/;

export const MAX_MEDIA_BYTES = 16 * 1024 * 1024; // WhatsApp's own largest media limit

export function mediaDir(env: Record<string, string | undefined> = process.env): string {
  return resolve(env.MEDIA_DIR || ".media");
}

export const isStorageKey = (key: string) => KEY.test(key);

/** Writes the bytes under a new random key and returns it. */
export async function saveMedia(bytes: Uint8Array, ext: string, dir = mediaDir()): Promise<string> {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const key = `${randomBytes(16).toString("hex")}.${safeExt}`;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, key), bytes, { flag: "wx" });
  return key;
}

/** Reads a stored file, or null when the key is malformed or the file is gone. */
export async function readMedia(key: string, dir = mediaDir()): Promise<Buffer | null> {
  if (!isStorageKey(key)) return null;
  try {
    return await readFile(join(dir, key));
  } catch {
    return null;
  }
}

export async function mediaExists(key: string, dir = mediaDir()): Promise<boolean> {
  if (!isStorageKey(key)) return false;
  try {
    return (await stat(join(dir, key))).isFile();
  } catch {
    return false;
  }
}
