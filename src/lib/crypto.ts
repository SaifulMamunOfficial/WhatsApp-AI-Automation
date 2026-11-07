import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for secrets stored in the database (channel access tokens).
// Format: "v1:<iv b64>:<auth tag b64>:<ciphertext b64>". The version prefix leaves
// room to rotate the key or algorithm later.

const VERSION = "v1";

function loadKey(keyHex: string | undefined): Buffer {
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(keyHex, "hex");
}

export function encryptSecret(plaintext: string, keyHex = process.env.ENCRYPTION_KEY): string {
  const key = loadKey(keyHex);
  const iv = randomBytes(12); // 96-bit nonce, fresh per message
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Throws if the payload was tampered with or the key is wrong. */
export function decryptSecret(payload: string, keyHex = process.env.ENCRYPTION_KEY): string {
  const key = loadKey(keyHex);
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unsupported encrypted secret format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
