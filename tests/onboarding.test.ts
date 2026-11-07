import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { completeCoexistenceOnboarding, graphOnboardingApi, requestSyncOnce, type OnboardingApi } from "@/core/channels/onboarding";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "d".repeat(64);
  t = await createTestDb();
}, 60_000);
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.db.delete(schema.channels);
});

const T0 = new Date("2026-03-10T12:00:00Z");

type Mocked = { [K in keyof OnboardingApi]: ReturnType<typeof vi.fn> };
function fakeApi(over: Partial<Mocked> = {}): Mocked & OnboardingApi {
  const api = {
    exchangeCodeForToken: vi.fn().mockResolvedValue("BIZ-TOKEN"),
    getPhoneNumber: vi.fn().mockResolvedValue({ id: "5551234567", displayPhoneNumber: "+880 1711-000000", verifiedName: "Saimum", isOnBizApp: true, platformType: "CLOUD_API" }),
    listWabaPhoneNumbers: vi.fn().mockResolvedValue([{ id: "5551234567" }]),
    subscribeApp: vi.fn().mockResolvedValue(undefined),
    requestSync: vi.fn().mockResolvedValue("REQ"),
    ...over,
  };
  return api as Mocked & OnboardingApi;
}

const input = { code: "CODE", wabaId: "1000", phoneNumberId: "5551234567" };
const channels = () => t.db.select().from(schema.channels);
const state = async () => (await t.db.select().from(schema.whatsappSyncState))[0];

describe("completeCoexistenceOnboarding", () => {
  it("saves the channel with an encrypted token, subscribes webhooks, and requests both syncs once", async () => {
    const api = fakeApi();
    const r = await completeCoexistenceOnboarding(t.db, api, input, () => T0);
    expect(r).toMatchObject({ ok: true, phoneNumberId: "5551234567", contacts: "requested", history: "requested", warnings: [] });

    const [ch] = await channels();
    expect(ch).toMatchObject({ type: "whatsapp", externalId: "5551234567", wabaId: "1000", name: "Saimum", displayPhone: "+880 1711-000000", status: "active", botEnabled: false });
    expect(ch.accessTokenEncrypted).not.toContain("BIZ-TOKEN");
    expect(decryptSecret(ch.accessTokenEncrypted!)).toBe("BIZ-TOKEN");

    expect(api.subscribeApp).toHaveBeenCalledWith("1000", "BIZ-TOKEN");
    expect(api.requestSync.mock.calls.map((c) => c[1])).toEqual(["smb_app_state_sync", "history"]);
    expect(await state()).toMatchObject({ historyStatus: "requested", contactsRequestId: "REQ", historyRequestId: "REQ" });
  });

  it("refuses a number that is not on the Business App and changes nothing", async () => {
    for (const isOnBizApp of [false, undefined]) {
      const api = fakeApi({ getPhoneNumber: vi.fn().mockResolvedValue({ id: "5551234567", isOnBizApp, platformType: "CLOUD_API" }) });
      const r = await completeCoexistenceOnboarding(t.db, api, input, () => T0);
      expect(r).toMatchObject({ ok: false, code: "not_business_app" });
      expect(api.subscribeApp).not.toHaveBeenCalled();
      expect(api.requestSync).not.toHaveBeenCalled();
      expect(await channels()).toHaveLength(0);
    }
  });

  it("looks the number up from the WABA when the event had none; refuses 0 or several", async () => {
    const api = fakeApi();
    expect((await completeCoexistenceOnboarding(t.db, api, { code: "C", wabaId: "1000" }, () => T0)).ok).toBe(true);
    expect(api.getPhoneNumber).toHaveBeenCalledWith("5551234567", "BIZ-TOKEN");

    await t.db.delete(schema.channels);
    const none = fakeApi({ listWabaPhoneNumbers: vi.fn().mockResolvedValue([]) });
    expect(await completeCoexistenceOnboarding(t.db, none, { code: "C", wabaId: "1000" }, () => T0)).toMatchObject({ ok: false, code: "no_phone_number" });
    const many = fakeApi({ listWabaPhoneNumbers: vi.fn().mockResolvedValue([{ id: "1" }, { id: "2" }]) });
    expect(await completeCoexistenceOnboarding(t.db, many, { code: "C", wabaId: "1000" }, () => T0)).toMatchObject({ ok: false, code: "no_phone_number" });
    expect(await channels()).toHaveLength(0);
  });

  it("stops cleanly when the token exchange fails or the webhook subscription fails", async () => {
    const bad = fakeApi({ exchangeCodeForToken: vi.fn().mockRejectedValue(new Error("code expired")) });
    expect(await completeCoexistenceOnboarding(t.db, bad, input, () => T0)).toMatchObject({ ok: false, code: "token_exchange" });
    expect(bad.getPhoneNumber).not.toHaveBeenCalled();

    const noSub = fakeApi({ subscribeApp: vi.fn().mockRejectedValue(new Error("nope")) });
    expect(await completeCoexistenceOnboarding(t.db, noSub, input, () => T0)).toMatchObject({ ok: false, code: "subscribe_failed" });
    expect(await channels()).toHaveLength(0);
  });

  it("validates its input before calling Meta", async () => {
    const api = fakeApi();
    for (const bad of [{ code: "", wabaId: "1" }, { code: "c", wabaId: "abc" }, { code: "c", wabaId: "1", phoneNumberId: "x/y" }]) {
      expect(await completeCoexistenceOnboarding(t.db, api, bad, () => T0)).toMatchObject({ ok: false, code: "invalid_input" });
    }
    expect(api.exchangeCodeForToken).not.toHaveBeenCalled();
  });

  it("re-onboarding refreshes the token but never repeats a sync (Meta allows it once)", async () => {
    await completeCoexistenceOnboarding(t.db, fakeApi(), input, () => T0);
    await t.db.update(schema.channels).set({ botEnabled: true, isTest: true });

    const again = fakeApi({ exchangeCodeForToken: vi.fn().mockResolvedValue("NEW-TOKEN") });
    const r = await completeCoexistenceOnboarding(t.db, again, input, () => new Date(T0.getTime() + 3600_000));
    expect(r).toMatchObject({ ok: true, contacts: "already_requested", history: "already_requested" });
    expect(again.requestSync).not.toHaveBeenCalled();

    const all = await channels();
    expect(all).toHaveLength(1);
    expect(decryptSecret(all[0].accessTokenEncrypted!)).toBe("NEW-TOKEN");
    expect(all[0]).toMatchObject({ botEnabled: true, isTest: true }); // not reset by re-onboarding
  });

  it("records a failed sync request, allows a retry within 24h, and blocks it after", async () => {
    const flaky = fakeApi({ requestSync: vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue("REQ2") });
    const r = await completeCoexistenceOnboarding(t.db, flaky, input, () => T0);
    expect(r).toMatchObject({ ok: true, contacts: "failed", history: "requested" });
    expect((r as { warnings: string[] }).warnings).toHaveLength(1);
    // The contacts failure stays visible even though history succeeded afterwards.
    expect(await state()).toMatchObject({ contactsRequestedAt: null, historyStatus: "requested" });
    expect((await state()).lastError).toContain("কন্টাক্ট");

    const [ch] = await channels();
    expect(await requestSyncOnce(t.db, flaky, ch.id, "smb_app_state_sync", () => new Date(T0.getTime() + 3600_000))).toBe("requested");
    expect((await state()).contactsRequestId).toBe("REQ2");

    // A different onboarding that is already older than 24h cannot ask any more.
    await t.db.update(schema.whatsappSyncState).set({ contactsRequestedAt: null });
    const late = new Date(T0.getTime() + 25 * 3600_000);
    expect(await requestSyncOnce(t.db, fakeApi(), ch.id, "smb_app_state_sync", () => late)).toBe("failed");
    expect((await state()).lastError).toContain("২৪ ঘণ্টা");
  });
});

describe("the real Graph flow never registers the number", () => {
  it("only ever calls the expected Graph endpoints, with no /register", async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      const path = new URL(url).pathname;
      let body: unknown = {};
      if (path.endsWith("/oauth/access_token")) body = { access_token: "BIZ", token_type: "bearer" };
      else if (path.endsWith("/subscribed_apps")) body = { success: true };
      else if (path.endsWith("/smb_app_data")) body = { request_id: "R" };
      else if (path.endsWith("/5551234567")) body = { id: "5551234567", display_phone_number: "+880", is_on_biz_app: true, platform_type: "CLOUD_API" };
      return new Response(JSON.stringify(body), { status: 200 });
    });

    const api = graphOnboardingApi({ appId: "APP", appSecret: "SECRET" }, { graphVersion: "v23.0", fetchImpl });
    const r = await completeCoexistenceOnboarding(t.db, api, input, () => T0);
    expect(r.ok).toBe(true);

    const paths = calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);
    expect(paths).toEqual([
      "GET /v23.0/oauth/access_token",
      "GET /v23.0/5551234567",
      "POST /v23.0/1000/subscribed_apps",
      "POST /v23.0/5551234567/smb_app_data",
      "POST /v23.0/5551234567/smb_app_data",
    ]);
    expect(calls.some((c) => /register/i.test(c.url))).toBe(false);
  });
});
