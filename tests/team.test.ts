import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { changeOwnPassword, createMember, listTeam, resetMemberPassword, setMemberActive, setMemberRole, updateOwnName } from "@/core/auth/team";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: string;
let admin2: string;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());

beforeEach(async () => {
  await t.db.delete(schema.users);
  const hash = await hashPassword("old-password-123");
  [{ id: admin }, { id: admin2 }] = await t.db
    .insert(schema.users)
    .values([
      { email: "a@x.org", name: "A", role: "admin", passwordHash: hash },
      { email: "b@x.org", name: "B", role: "admin", passwordHash: hash },
    ])
    .returning({ id: schema.users.id });
});

const session = (userId: string, tokenHash: string) =>
  t.db.insert(schema.sessions).values({ userId, tokenHash, expiresAt: new Date(Date.now() + 1e7) });
const sessionsOf = async (userId: string) => (await t.db.select().from(schema.sessions).where(eq(schema.sessions.userId, userId))).map((s) => s.tokenHash);

describe("createMember", () => {
  it("creates an agent with a generated temporary password that must be changed", async () => {
    const r = await createMember(t.db, { name: " Rina ", email: " RINA@Saimum.ORG ", role: "agent" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.temporaryPassword.length).toBeGreaterThanOrEqual(10);
    const [row] = (await listTeam(t.db)).filter((m) => m.email === "rina@saimum.org");
    expect(row).toMatchObject({ name: "Rina", role: "agent", active: true, mustChangePassword: true });
    const [{ passwordHash }] = await t.db.select().from(schema.users).where(eq(schema.users.id, row.id));
    expect(passwordHash).not.toContain(r.temporaryPassword);
    expect(await verifyPassword(r.temporaryPassword, passwordHash)).toBe(true);
  });

  it("uses a given password when it is long enough", async () => {
    const r = await createMember(t.db, { name: "X", email: "x@x.org", role: "agent", password: "chosen-pass-12" });
    expect(r).toMatchObject({ ok: true, temporaryPassword: "chosen-pass-12" });
  });

  it("rejects bad input and duplicate emails", async () => {
    expect((await createMember(t.db, { name: "", email: "x@x.org", role: "agent" })).ok).toBe(false);
    expect((await createMember(t.db, { name: "X", email: "not-an-email", role: "agent" })).ok).toBe(false);
    expect((await createMember(t.db, { name: "X", email: "x@x.org", role: "owner" })).ok).toBe(false);
    expect((await createMember(t.db, { name: "X", email: "x@x.org", role: "agent", password: "short" })).ok).toBe(false);
    expect((await createMember(t.db, { name: "X", email: "A@X.ORG", role: "agent" })).ok).toBe(false); // same as a@x.org
  });
});

describe("role and active guards", () => {
  it("cannot change or deactivate yourself", async () => {
    expect((await setMemberRole(t.db, admin, admin, "agent")).ok).toBe(false);
    expect((await setMemberActive(t.db, admin, admin, false)).ok).toBe(false);
  });

  it("never leaves the system without an active admin", async () => {
    expect((await setMemberRole(t.db, admin, admin2, "agent")).ok).toBe(true); // admin still there
    // admin2 is now an agent; admin is the last one: another admin cannot demote or deactivate them
    const [third] = await t.db.insert(schema.users).values({ email: "c@x.org", name: "C", role: "admin", passwordHash: "x" }).returning({ id: schema.users.id });
    expect((await setMemberActive(t.db, third.id, admin, false)).ok).toBe(true); // third + admin: fine, third remains
    expect((await setMemberActive(t.db, admin, third.id, false)).ok).toBe(false); // admin is inactive now, third is the last
    expect((await setMemberRole(t.db, admin, third.id, "agent")).ok).toBe(false);
  });

  it("deactivating signs the person out; reactivating keeps the account", async () => {
    const r = await createMember(t.db, { name: "Rina", email: "r@x.org", role: "agent" });
    expect(r.ok).toBe(true);
    const [rina] = (await listTeam(t.db)).filter((m) => m.email === "r@x.org");
    await session(rina.id, "tok1");
    expect((await setMemberActive(t.db, admin, rina.id, false)).ok).toBe(true);
    expect(await sessionsOf(rina.id)).toEqual([]);
    expect((await listTeam(t.db)).find((m) => m.id === rina.id)?.active).toBe(false);
    expect((await setMemberActive(t.db, admin, rina.id, true)).ok).toBe(true);
    expect((await listTeam(t.db)).find((m) => m.id === rina.id)?.active).toBe(true);
  });

  it("unknown member is reported", async () => {
    const ghost = "00000000-0000-0000-0000-000000000000";
    expect((await setMemberRole(t.db, admin, ghost, "agent")).ok).toBe(false);
    expect((await setMemberActive(t.db, admin, ghost, false)).ok).toBe(false);
    expect((await resetMemberPassword(t.db, admin, ghost)).ok).toBe(false);
  });
});

describe("resetMemberPassword", () => {
  it("sets a temporary password, forces a change and signs the person out", async () => {
    await session(admin2, "tokA");
    const r = await resetMemberPassword(t.db, admin, admin2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await t.db.select().from(schema.users).where(eq(schema.users.id, admin2));
    expect(row.mustChangePassword).toBe(true);
    expect(await verifyPassword(r.temporaryPassword, row.passwordHash)).toBe(true);
    expect(await verifyPassword("old-password-123", row.passwordHash)).toBe(false);
    expect(await sessionsOf(admin2)).toEqual([]);
  });

  it("does not reset your own password here", async () => {
    expect((await resetMemberPassword(t.db, admin, admin)).ok).toBe(false);
  });
});

describe("own profile", () => {
  it("updates the name with limits", async () => {
    expect((await updateOwnName(t.db, admin, " New Name ")).ok).toBe(true);
    expect((await listTeam(t.db)).find((m) => m.id === admin)?.name).toBe("New Name");
    expect((await updateOwnName(t.db, admin, "   ")).ok).toBe(false);
    expect((await updateOwnName(t.db, admin, "x".repeat(101))).ok).toBe(false);
  });

  it("changes the password only with the right current one and a valid new one", async () => {
    const bad = (input: { current: string; next: string; confirm: string }) => changeOwnPassword(t.db, admin, input);
    expect((await bad({ current: "wrong-password", next: "brand-new-pass-1", confirm: "brand-new-pass-1" })).ok).toBe(false);
    expect((await bad({ current: "old-password-123", next: "short", confirm: "short" })).ok).toBe(false);
    expect((await bad({ current: "old-password-123", next: "brand-new-pass-1", confirm: "different-pass-1" })).ok).toBe(false);
    expect((await bad({ current: "old-password-123", next: "old-password-123", confirm: "old-password-123" })).ok).toBe(false);
  });

  it("clears the must-change flag and signs out the other sessions but keeps this one", async () => {
    await t.db.update(schema.users).set({ mustChangePassword: true }).where(eq(schema.users.id, admin));
    await session(admin, "mine");
    await session(admin, "other");
    const r = await changeOwnPassword(t.db, admin, { current: "old-password-123", next: "brand-new-pass-1", confirm: "brand-new-pass-1" }, "mine");
    expect(r.ok).toBe(true);
    const [row] = await t.db.select().from(schema.users).where(eq(schema.users.id, admin));
    expect(row.mustChangePassword).toBe(false);
    expect(await verifyPassword("brand-new-pass-1", row.passwordHash)).toBe(true);
    expect(await sessionsOf(admin)).toEqual(["mine"]);
  });
});
