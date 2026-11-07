import { describe, expect, it } from "vitest";
import { signMetaBody, verifyMetaSignature } from "@/channels/meta-signature";

const SECRET = "app-secret-for-tests";
const BODY = '{"object":"whatsapp_business_account","entry":[]}';

describe("verifyMetaSignature", () => {
  it("accepts a correct signature", () => {
    expect(verifyMetaSignature(BODY, signMetaBody(BODY, SECRET), SECRET)).toBe(true);
  });

  it("rejects a wrong secret, a changed body, and a changed signature", () => {
    const sig = signMetaBody(BODY, SECRET);
    expect(verifyMetaSignature(BODY, sig, "other-secret")).toBe(false);
    expect(verifyMetaSignature(BODY + " ", sig, SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0"), SECRET)).toBe(false);
  });

  it("rejects missing or malformed headers and a missing secret", () => {
    const sig = signMetaBody(BODY, SECRET);
    expect(verifyMetaSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, "", SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, sig.replace("sha256=", "sha1="), SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, "sha256=nothex", SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, "sha256=", SECRET)).toBe(false);
    expect(verifyMetaSignature(BODY, sig, undefined)).toBe(false);
    expect(verifyMetaSignature(BODY, sig, "")).toBe(false);
  });

  it("is computed over raw bytes, including non-ASCII", () => {
    const body = '{"text":"হ্যালো"}';
    expect(verifyMetaSignature(body, signMetaBody(body, SECRET), SECRET)).toBe(true);
  });
});
