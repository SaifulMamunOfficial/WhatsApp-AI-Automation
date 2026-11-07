import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const KEY = "a".repeat(64);
const OTHER_KEY = "b".repeat(64);

describe("encryptSecret / decryptSecret", () => {
  it("round-trips, including non-ASCII text", () => {
    const token = "EAAG-token-বাংলা-123";
    expect(decryptSecret(encryptSecret(token, KEY), KEY)).toBe(token);
  });

  it("does not leak the plaintext and uses a fresh nonce each time", () => {
    const a = encryptSecret("secret-token", KEY);
    const b = encryptSecret("secret-token", KEY);
    expect(a).not.toContain("secret-token");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
  });

  it("fails with the wrong key", () => {
    expect(() => decryptSecret(encryptSecret("x", KEY), OTHER_KEY)).toThrow();
  });

  it("detects tampering with the ciphertext", () => {
    const [v, iv, tag, data] = encryptSecret("some token value", KEY).split(":");
    const bytes = Buffer.from(data, "base64");
    bytes[0] ^= 0xff;
    expect(() => decryptSecret([v, iv, tag, bytes.toString("base64")].join(":"), KEY)).toThrow();
  });

  it("rejects bad keys and unknown formats", () => {
    expect(() => encryptSecret("x", "short")).toThrow(/ENCRYPTION_KEY/);
    expect(() => encryptSecret("x", undefined)).toThrow(/ENCRYPTION_KEY/);
    expect(() => decryptSecret("v9:a:b:c", KEY)).toThrow(/format/);
    expect(() => decryptSecret("garbage", KEY)).toThrow(/format/);
  });
});
