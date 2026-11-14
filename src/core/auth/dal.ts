import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "./session";
import { hasRole, type Role } from "./roles";

/**
 * Like requireUser, but does NOT force a pending password change. Only the app shell and the
 * profile page (where the password is changed) may use it.
 */
export async function requireUserAllowingPasswordChange(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Use in pages, layouts and actions. Redirects to /login when not signed in, and to the profile page
 * while the person still has a temporary password to replace.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await requireUserAllowingPasswordChange();
  if (user.mustChangePassword) redirect("/settings/profile");
  return user;
}

/** Like requireUser, but also enforces the role. Send non-matching users home. */
export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user, ...allowed)) redirect("/");
  return user;
}
