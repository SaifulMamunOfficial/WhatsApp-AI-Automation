import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { generateSessionToken, hashSessionToken } from "@/lib/session-token";
import type { Role } from "./roles";

export const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const REFRESH_WHEN_LEFT_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function createSession(userId: string): Promise<void> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ tokenHash: hashSessionToken(token), userId, expiresAt });
  await setSessionCookie(token, expiresAt);
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/** Resolves the logged-in user from the cookie, or null. Memoized per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  // Session expiry depends on the current time, so this must never run during
  // prerendering. (Cache Components rejects `new Date()` there.)
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date()), eq(users.active, true)))
    .limit(1);

  if (!row) return null;

  // Sliding expiry. Cookies can only be written in Server Actions / Route Handlers,
  // so a failure here (e.g. during render) is harmless: we refresh on a later request.
  if (row.expiresAt.getTime() - Date.now() < REFRESH_WHEN_LEFT_MS) {
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.tokenHash, tokenHash));
    try {
      await setSessionCookie(token, expiresAt);
    } catch {
      /* not in a context that can set cookies */
    }
  }

  return { id: row.id, email: row.email, name: row.name, role: row.role };
});
