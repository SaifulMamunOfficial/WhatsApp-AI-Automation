import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes, url-safe. This is what goes into the cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hex of the token. This is what is stored in the database. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
