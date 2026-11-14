import { randomBytes } from "node:crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "@/lib/password";
import type { Role } from "./roles";

// Admin-side team management and the signed-in person's own profile. Pure database logic (no
// cookies, no framework) so it is easy to test; the server actions in team-actions.ts add the
// role checks. Passwords are never stored or returned in plain text: a generated temporary
// password is returned ONCE to the admin who created/reset the account.

export type TeamResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const u = schema.users;
const fail = (error: string) => ({ ok: false as const, error });

const generatePassword = () => randomBytes(12).toString("base64url");

const nameSchema = z.string().trim().min(1).max(100);
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(200));

export async function listTeam(db: Db): Promise<TeamMember[]> {
  return db
    .select({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active, mustChangePassword: u.mustChangePassword, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt })
    .from(u)
    .orderBy(asc(u.createdAt));
}

/** Active admins other than `exceptId`: used to never leave the system without an admin. */
async function otherActiveAdmins(db: Db, exceptId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(u)
    .where(and(eq(u.role, "admin"), eq(u.active, true), ne(u.id, exceptId)));
  return n;
}

async function endSessions(db: Db, userId: string, exceptTokenHash?: string) {
  const s = schema.sessions;
  await db.delete(s).where(exceptTokenHash ? and(eq(s.userId, userId), ne(s.tokenHash, exceptTokenHash)) : eq(s.userId, userId));
}

/** New member with a temporary password (the one given, else generated) they must change at first login. */
export async function createMember(
  db: Db,
  input: { name: string; email: string; role: string; password?: string },
): Promise<TeamResult<{ temporaryPassword: string }>> {
  const name = nameSchema.safeParse(input.name);
  const email = emailSchema.safeParse(input.email);
  if (!name.success) return fail("নাম ১–১০০ অক্ষরের হতে হবে।");
  if (!email.success) return fail("ইমেইল ঠিক নয়।");
  if (input.role !== "admin" && input.role !== "agent") return fail("রোল ঠিক নয়।");
  const given = (input.password ?? "").trim();
  if (given && (given.length < MIN_PASSWORD_LENGTH || given.length > 200)) return fail("পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।");

  const [exists] = await db.select({ id: u.id }).from(u).where(eq(u.email, email.data)).limit(1);
  if (exists) return fail("এই ইমেইলে আগেই একজন আছেন।");

  const temporaryPassword = given || generatePassword();
  await db.insert(u).values({ name: name.data, email: email.data, role: input.role, passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true });
  return { ok: true, temporaryPassword };
}

export async function setMemberRole(db: Db, actorId: string, targetId: string, role: string): Promise<TeamResult> {
  if (role !== "admin" && role !== "agent") return fail("রোল ঠিক নয়।");
  if (actorId === targetId) return fail("নিজের রোল নিজে বদলানো যায় না।");
  const [target] = await db.select({ role: u.role, active: u.active }).from(u).where(eq(u.id, targetId)).limit(1);
  if (!target) return fail("সদস্যকে পাওয়া যায়নি।");
  if (target.role === "admin" && role === "agent" && target.active && (await otherActiveAdmins(db, targetId)) === 0) return fail("শেষ অ্যাডমিনকে এজেন্ট করা যায় না।");
  await db.update(u).set({ role }).where(eq(u.id, targetId));
  return { ok: true };
}

/** Deactivating also signs the person out everywhere. Reactivating does not change the password. */
export async function setMemberActive(db: Db, actorId: string, targetId: string, active: boolean): Promise<TeamResult> {
  if (actorId === targetId) return fail("নিজের অ্যাকাউন্ট নিজে বন্ধ করা যায় না।");
  const [target] = await db.select({ role: u.role, active: u.active }).from(u).where(eq(u.id, targetId)).limit(1);
  if (!target) return fail("সদস্যকে পাওয়া যায়নি।");
  if (!active && target.role === "admin" && target.active && (await otherActiveAdmins(db, targetId)) === 0) return fail("শেষ অ্যাডমিনকে বন্ধ করা যায় না।");
  await db.update(u).set({ active }).where(eq(u.id, targetId));
  if (!active) await endSessions(db, targetId);
  return { ok: true };
}

/** New temporary password; the person is signed out everywhere and must choose their own at next login. */
export async function resetMemberPassword(db: Db, actorId: string, targetId: string, password?: string): Promise<TeamResult<{ temporaryPassword: string }>> {
  if (actorId === targetId) return fail("নিজের পাসওয়ার্ড প্রোফাইল পাতা থেকে বদলান।");
  const given = (password ?? "").trim();
  if (given && (given.length < MIN_PASSWORD_LENGTH || given.length > 200)) return fail("পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।");
  const [target] = await db.select({ id: u.id }).from(u).where(eq(u.id, targetId)).limit(1);
  if (!target) return fail("সদস্যকে পাওয়া যায়নি।");
  const temporaryPassword = given || generatePassword();
  await db.update(u).set({ passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true }).where(eq(u.id, targetId));
  await endSessions(db, targetId);
  return { ok: true, temporaryPassword };
}

export async function updateOwnName(db: Db, userId: string, name: string): Promise<TeamResult> {
  const n = nameSchema.safeParse(name);
  if (!n.success) return fail("নাম ১–১০০ অক্ষরের হতে হবে।");
  await db.update(u).set({ name: n.data }).where(eq(u.id, userId));
  return { ok: true };
}

/**
 * Changes the signed-in person's own password. Needs the current password, signs out every OTHER
 * session (keeping the one in use, `keepTokenHash`), and clears the "must change" flag.
 */
export async function changeOwnPassword(
  db: Db,
  userId: string,
  input: { current: string; next: string; confirm: string },
  keepTokenHash?: string,
): Promise<TeamResult> {
  const [me] = await db.select({ hash: u.passwordHash }).from(u).where(eq(u.id, userId)).limit(1);
  if (!me) return fail("সদস্যকে পাওয়া যায়নি।");
  if (!(await verifyPassword(input.current, me.hash))) return fail("বর্তমান পাসওয়ার্ড ঠিক নয়।");
  if (input.next.length < MIN_PASSWORD_LENGTH || input.next.length > 200) return fail("নতুন পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।");
  if (input.next !== input.confirm) return fail("নতুন পাসওয়ার্ড দুইবার একই লিখুন।");
  if (input.next === input.current) return fail("নতুন পাসওয়ার্ড আগেরটার থেকে আলাদা হতে হবে।");
  await db.update(u).set({ passwordHash: await hashPassword(input.next), mustChangePassword: false }).where(eq(u.id, userId));
  await endSessions(db, userId, keepTokenHash);
  return { ok: true };
}
