import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "./session";
import { hasRole, type Role } from "./roles";

/** Use in pages, layouts and actions. Redirects to /login when not signed in. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Like requireUser, but also enforces the role. Send non-matching users home. */
export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user, ...allowed)) redirect("/");
  return user;
}
