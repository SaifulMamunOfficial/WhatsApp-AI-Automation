import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { MESSENGER_SUBSCRIBED_FIELDS, exchangeForLongLivedUserToken, listManagedPages, subscribePage } from "@/channels/messenger/pages";
import { connectMessengerPage, graphPageApi, listPagesForPicker, type PageApi } from "@/core/channels/page-onboarding";
import { createTestDb } from "./helpers/test-db";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fakeFetch = (body: unknown, status = 200) => vi.fn().mockImplementation(async () => json(body, status));

describe("Messenger page API client", () => {
  it("exchanges for a long-lived token without leaking secrets in errors", async () => {
    const f = fakeFetch({ access_token: "LONG" });
    expect(await exchangeForLongLivedUserToken("SHORT", { appId: "A", appSecret: "S" }, { graphVersion: "v23.0", fetchImpl: f })).toBe("LONG");
    const u = new URL(f.mock.calls[0][0]);
    expect(u.pathname).toBe("/v23.0/oauth/access_token");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ grant_type: "fb_exchange_token", client_id: "A", fb_exchange_token: "SHORT" });

    const err = await exchangeForLongLivedUserToken("SHORT", { appId: "A", appSecret: "S" }, { fetchImpl: fakeFetch({ error: { message: "bad", code: 190 } }, 400) }).catch((e) => e);
    expect(err).toMatchObject({ status: 400, code: 190 });
    expect(err.message).not.toMatch(/SHORT|S\b.*secret/);
  });

  it("lists pages (token in header), dropping entries without a token", async () => {
    const f = fakeFetch({ data: [{ id: "1", name: "A", access_token: "TA", tasks: ["MANAGE"] }, { id: "2", name: "B" }, { name: "C", access_token: "x" }] });
    const pages = await listManagedPages("UT", { fetchImpl: f });
    expect(pages).toEqual([{ id: "1", name: "A", accessToken: "TA", tasks: ["MANAGE"] }]);
    expect(f.mock.calls[0][1].headers.Authorization).toBe("Bearer UT");
    expect(f.mock.calls[0][0]).not.toContain("UT");
  });

  it("subscribes the page to exactly the Messenger fields we handle", async () => {
    const f = fakeFetch({ success: true });
    await subscribePage("110", "PT", { graphVersion: "v23.0", fetchImpl: f });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/110/subscribed_apps");
    expect(init.headers.Authorization).toBe("Bearer PT");
    expect(new URLSearchParams(init.body).get("subscribed_fields")).toBe("messages,message_echoes,messaging_postbacks");
    expect(MESSENGER_SUBSCRIBED_FIELDS).toEqual(["messages", "message_echoes", "messaging_postbacks"]);
    await expect(subscribePage("1", "T", { fetchImpl: fakeFetch({ success: false }) })).rejects.toThrow(/not accepted/);
  });
});

describe("connectMessengerPage", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = "e".repeat(64);
    t = await createTestDb();
  }, 60_000);
  afterAll(async () => t.close());
  beforeEach(async () => {
    await t.db.delete(schema.channels);
  });

  const api = (over: Partial<Record<keyof PageApi, ReturnType<typeof vi.fn>>> = {}) =>
    ({
      exchangeForLongLivedUserToken: vi.fn().mockResolvedValue("LONG"),
      listManagedPages: vi.fn().mockResolvedValue([
        { id: "110", name: "Saimum KIDS", accessToken: "PAGE-TOKEN", tasks: ["MANAGE", "MESSAGING"] },
        { id: "220", name: "Other", accessToken: "OT", tasks: ["ANALYZE"] },
      ]),
      subscribePage: vi.fn().mockResolvedValue(undefined),
      ...over,
    }) as unknown as PageApi & Record<keyof PageApi, ReturnType<typeof vi.fn>>;
  const channels = () => t.db.select().from(schema.channels);

  it("saves the page with an encrypted token, bot off, and subscribes it", async () => {
    const a = api();
    const r = await connectMessengerPage(t.db, a, { userToken: "U", pageId: "110", isTest: true });
    expect(r).toMatchObject({ ok: true, pageId: "110", name: "Saimum KIDS" });
    expect(a.subscribePage).toHaveBeenCalledWith("110", "PAGE-TOKEN");
    const [ch] = await channels();
    expect(ch).toMatchObject({ type: "messenger", externalId: "110", status: "active", isTest: true, botEnabled: false });
    expect(ch.accessTokenEncrypted).not.toContain("PAGE-TOKEN");
    expect(decryptSecret(ch.accessTokenEncrypted!)).toBe("PAGE-TOKEN");
  });

  it("refuses pages the person lacks messaging rights on, or does not manage, and changes nothing", async () => {
    const a = api();
    expect(await connectMessengerPage(t.db, a, { userToken: "U", pageId: "220", isTest: true })).toMatchObject({ ok: false, code: "no_permission" });
    expect(await connectMessengerPage(t.db, a, { userToken: "U", pageId: "999", isTest: true })).toMatchObject({ ok: false, code: "page_not_found" });
    expect(a.subscribePage).not.toHaveBeenCalled();
    expect(await channels()).toHaveLength(0);
  });

  it("reports exchange and subscribe failures cleanly, saving nothing", async () => {
    expect(await connectMessengerPage(t.db, api({ exchangeForLongLivedUserToken: vi.fn().mockRejectedValue(new Error("expired")) }), { userToken: "U", pageId: "110", isTest: true })).toMatchObject({ ok: false, code: "token_exchange" });
    expect(await connectMessengerPage(t.db, api({ subscribePage: vi.fn().mockRejectedValue(new Error("no")) }), { userToken: "U", pageId: "110", isTest: true })).toMatchObject({ ok: false, code: "subscribe_failed" });
    expect(await connectMessengerPage(t.db, api(), { userToken: "", pageId: "110", isTest: true })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await connectMessengerPage(t.db, api(), { userToken: "U", pageId: "x1", isTest: true })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await channels()).toHaveLength(0);
  });

  it("reconnecting refreshes the token but keeps botEnabled and isTest", async () => {
    await connectMessengerPage(t.db, api(), { userToken: "U", pageId: "110", isTest: true });
    await t.db.update(schema.channels).set({ botEnabled: true, status: "disconnected" });
    const again = api({ listManagedPages: vi.fn().mockResolvedValue([{ id: "110", name: "Renamed", accessToken: "NEW", tasks: ["MANAGE"] }]) });
    await connectMessengerPage(t.db, again, { userToken: "U", pageId: "110", isTest: false });
    const all = await channels();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ name: "Renamed", status: "active", botEnabled: true, isTest: true });
    expect(decryptSecret(all[0].accessTokenEncrypted!)).toBe("NEW");
  });

  it("the picker never exposes page tokens", async () => {
    const r = await listPagesForPicker(api(), "U");
    expect(r).toEqual({ ok: true, pages: [{ id: "110", name: "Saimum KIDS", canMessage: true }, { id: "220", name: "Other", canMessage: false }] });
    expect(JSON.stringify(r)).not.toMatch(/PAGE-TOKEN|OT\b/);
    expect(await listPagesForPicker(api({ listManagedPages: vi.fn().mockRejectedValue(new Error("x")) }), "U")).toMatchObject({ ok: false });
  });

  it("the real Graph flow only calls the expected endpoints", async () => {
    const calls: string[] = [];
    const f = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const p = new URL(url).pathname;
      calls.push(`${init?.method ?? "GET"} ${p}`);
      if (p.endsWith("/oauth/access_token")) return json({ access_token: "LONG" });
      if (p.endsWith("/me/accounts")) return json({ data: [{ id: "110", name: "P", access_token: "PT", tasks: ["MANAGE"] }] });
      return json({ success: true });
    });
    const r = await connectMessengerPage(t.db, graphPageApi({ appId: "A", appSecret: "S" }, { graphVersion: "v23.0", fetchImpl: f }), { userToken: "U", pageId: "110", isTest: true });
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["GET /v23.0/oauth/access_token", "GET /v23.0/me/accounts", "POST /v23.0/110/subscribed_apps"]);
  });
});
