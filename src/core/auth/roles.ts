export type Role = "admin" | "agent";

export function hasRole(user: { role: Role }, ...allowed: Role[]): boolean {
  return allowed.includes(user.role);
}
