import { describe, expect, it, vi } from "vitest";
import { MessengerSendError, sendMessengerText } from "@/channels/messenger/sender";

const base = { channelExternalId: "110000000000001", accessToken: "PAGE-TOKEN-xyz", to: "5550001112223334", text: "ধন্যবাদ" };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("sendMessengerText", () => {
  it("sends a RESPONSE message by default and returns the message id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ recipient_id: "5550001112223334", message_id: "mid.NEW" }));
    const r = await sendMessengerText(base, { graphVersion: "v23.0", fetchImpl });

    expect(r).toEqual({ externalId: "mid.NEW" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/110000000000001/messages");
    expect(init.headers.Authorization).toBe("Bearer PAGE-TOKEN-xyz");
    expect(JSON.parse(init.body)).toEqual({
      recipient: { id: "5550001112223334" },
      message: { text: "ধন্যবাদ" },
      messaging_type: "RESPONSE",
    });
    expect(url).not.toContain("PAGE-TOKEN");
    expect(init.body).not.toContain("PAGE-TOKEN");
  });

  it("uses MESSAGE_TAG + HUMAN_AGENT only when humanAgent is set", async () => {
    // A Response body can only be read once, so build a fresh one per call.
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse({ message_id: "mid.2" }));
    await sendMessengerText({ ...base, humanAgent: true }, { fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ messaging_type: "MESSAGE_TAG", tag: "HUMAN_AGENT" });

    await sendMessengerText({ ...base, humanAgent: false }, { fetchImpl });
    const normal = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(normal.messaging_type).toBe("RESPONSE");
    expect(normal).not.toHaveProperty("tag");
  });

  it("throws MessengerSendError with code and subcode, without leaking the token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "This message is sent outside of allowed window.", code: 10, error_subcode: 2018278 } }, 400));
    const err = await sendMessengerText(base, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(MessengerSendError);
    expect(err).toMatchObject({ status: 400, code: 10, subcode: 2018278 });
    expect(String(err.message)).not.toContain("PAGE-TOKEN");
  });

  it("handles non-JSON errors and a success without message_id", async () => {
    const html = vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 }));
    await expect(sendMessengerText(base, { fetchImpl: html })).rejects.toMatchObject({ status: 502 });
    const none = vi.fn().mockResolvedValue(jsonResponse({}));
    await expect(sendMessengerText(base, { fetchImpl: none })).rejects.toThrow(/no message_id/);
  });
});
