"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { loginLimiter } from "./rate-limit";
import { createSession, destroySession } from "./session";

export interface LoginState {
  error?: string;
}

// Verified against when the email is unknown, so response time does not reveal
// whether an account exists.
const dummyHash = hashPassword("dummy-password-for-timing");

export async function login(_prev: LoginState | undefined, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password || password.length > 1024) {
    return { error: "ইমেইল ও পাসওয়ার্ড দিন।" };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limiterKey = `${email}|${ip}`;
  if (loginLimiter.isBlocked(limiterKey)) {
    return { error: "অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।" };
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = await verifyPassword(password, user ? user.passwordHash : await dummyHash);

  if (!user || !ok || !user.active) {
    loginLimiter.recordFailure(limiterKey);
    return { error: "ইমেইল বা পাসওয়ার্ড ঠিক নয়।" };
  }

  loginLimiter.reset(limiterKey);
  await createSession(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
