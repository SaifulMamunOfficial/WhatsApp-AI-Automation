import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";
import { generateSessionToken, hashSessionToken } from "@/lib/session-token";
import { LoginRateLimiter } from "@/core/auth/rate-limit";
import { hasRole } from "@/core/auth/roles";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("wrong password", stored)).toBe(false);
  });

  it("salts: same password hashes differently", async () => {
    expect(await hashPassword("same-password-1")).not.toBe(await hashPassword("same-password-1"));
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });
});

describe("session tokens", () => {
  it("generates unique, long tokens and a stable 64-char hash", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashSessionToken(a)).toBe(hashSessionToken(a));
    expect(hashSessionToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(a)).not.toBe(a);
  });
});

describe("login rate limiter", () => {
  it("blocks after max failures and unblocks after the window", () => {
    const rl = new LoginRateLimiter(3, 1000);
    for (let i = 0; i < 3; i++) rl.recordFailure("k", 0);
    expect(rl.isBlocked("k", 500)).toBe(true);
    expect(rl.isBlocked("k", 1001)).toBe(false);
  });

  it("is per key and reset clears it", () => {
    const rl = new LoginRateLimiter(2, 1000);
    rl.recordFailure("a", 0);
    rl.recordFailure("a", 0);
    expect(rl.isBlocked("a", 1)).toBe(true);
    expect(rl.isBlocked("b", 1)).toBe(false);
    rl.reset("a");
    expect(rl.isBlocked("a", 1)).toBe(false);
  });
});

describe("roles", () => {
  it("checks role membership", () => {
    expect(hasRole({ role: "admin" }, "admin")).toBe(true);
    expect(hasRole({ role: "agent" }, "admin")).toBe(false);
    expect(hasRole({ role: "agent" }, "admin", "agent")).toBe(true);
  });
});
