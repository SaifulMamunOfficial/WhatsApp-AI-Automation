import { describe, expect, it, vi } from "vitest";
import {
  MetaApiError,
  exchangeCodeForToken,
  getPhoneNumber,
  listWabaPhoneNumbers,
  requestSync,
  subscribeApp,
} from "@/channels/whatsapp/coexistence";
import * as coexistence from "@/channels/whatsapp/coexistence";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
// A Response body can be read only once, so every call gets a fresh one.
const fakeFetch = (body: unknown, status = 200) => vi.fn().mockImplementation(async () => json(body, status));

describe("Coexistence Graph API client", () => {
  it("exchanges the code for a token (GET oauth/access_token)", async () => {
    const fetchImpl = fakeFetch({ access_token: "BIZ-TOKEN", token_type: "bearer" });
    const token = await exchangeCodeForToken("CODE123", { appId: "APP", appSecret: "SECRET" }, { graphVersion: "v23.0", fetchImpl });
    expect(token).toBe("BIZ-TOKEN");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe("GET");
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe("https://graph.facebook.com/v23.0/oauth/access_token");
    expect(Object.fromEntries(u.searchParams)).toEqual({ client_id: "APP", client_secret: "SECRET", code: "CODE123" });
  });

  it("never leaks the app secret or code in an error", async () => {
    const fetchImpl = fakeFetch({ error: { message: "Invalid verification code format.", code: 100 } }, 400);
    const err = await exchangeCodeForToken("CODE123", { appId: "APP", appSecret: "SECRET" }, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err).toMatchObject({ status: 400, code: 100 });
    expect(err.message).not.toMatch(/SECRET|CODE123/);
  });

  it("rejects a token response without access_token", async () => {
    await expect(exchangeCodeForToken("c", { appId: "A", appSecret: "S" }, { fetchImpl: fakeFetch({}) })).rejects.toThrow(/no access_token/);
  });

  it("reads is_on_biz_app and platform_type with the token in the header", async () => {
    const fetchImpl = fakeFetch({ id: "PN", display_phone_number: "+880 1711-000000", verified_name: "Saimum", is_on_biz_app: true, platform_type: "CLOUD_API" });
    const info = await getPhoneNumber("PN", "TOK", { fetchImpl });
    expect(info).toEqual({ id: "PN", displayPhoneNumber: "+880 1711-000000", verifiedName: "Saimum", isOnBizApp: true, platformType: "CLOUD_API" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("fields=id,display_phone_number,verified_name,is_on_biz_app,platform_type");
    expect(init.headers.Authorization).toBe("Bearer TOK");
    expect(url).not.toContain("TOK");
  });

  it("lists WABA numbers and subscribes the app (POST subscribed_apps, no body)", async () => {
    expect(await listWabaPhoneNumbers("W", "TOK", { fetchImpl: fakeFetch({ data: [{ id: "1" }, { id: "2" }] }) })).toEqual([{ id: "1" }, { id: "2" }]);
    expect(await listWabaPhoneNumbers("W", "TOK", { fetchImpl: fakeFetch({}) })).toEqual([]);

    const fetchImpl = fakeFetch({ success: true });
    await subscribeApp("WABA9", "TOK", { graphVersion: "v23.0", fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/WABA9/subscribed_apps");
    expect(init.method).toBe("POST");
    await expect(subscribeApp("W", "T", { fetchImpl: fakeFetch({ success: false }) })).rejects.toThrow(/not accepted/);
  });

  it("requests each sync type with the documented body and returns the request_id", async () => {
    const fetchImpl = fakeFetch({ messaging_product: "whatsapp", request_id: "REQ1" });
    expect(await requestSync("PN", "smb_app_state_sync", "TOK", { graphVersion: "v23.0", fetchImpl })).toBe("REQ1");
    expect(await requestSync("PN", "history", "TOK", { fetchImpl })).toBe("REQ1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/PN/smb_app_data");
    expect(JSON.parse(init.body)).toEqual({ messaging_product: "whatsapp", sync_type: "smb_app_state_sync" });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).sync_type).toBe("history");
  });

  it("exposes no way to register a number (it would pull the number off the Business App)", () => {
    const names = Object.keys(coexistence).map((n) => n.toLowerCase());
    expect(names.filter((n) => n.includes("register"))).toEqual([]);
  });
});
