import { describe, expect, it, vi } from "vitest";
import { sendWhatsAppText, WhatsAppSendError } from "@/channels/whatsapp/sender";

const input = { channelExternalId: "106540352242922", accessToken: "TOKEN-123", to: "16505551234", text: "হ্যালো" };

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("sendWhatsAppText", () => {
  it("posts the right request and returns the wamid", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ messages: [{ id: "wamid.NEW" }] }));
    const result = await sendWhatsAppText(input, { graphVersion: "v23.0", fetchImpl });

    expect(result).toEqual({ externalId: "wamid.NEW" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/106540352242922/messages");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer TOKEN-123");
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "16505551234",
      type: "text",
      text: { body: "হ্যালো", preview_url: false },
    });
    // The token must never be in the URL or body.
    expect(url).not.toContain("TOKEN-123");
    expect(init.body).not.toContain("TOKEN-123");
  });

  it("throws WhatsAppSendError with Meta's error, without leaking the token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Re-engagement message", code: 131047 } }, 400));
    const err = await sendWhatsAppText(input, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(WhatsAppSendError);
    expect(err).toMatchObject({ status: 400, code: 131047, message: "Re-engagement message" });
    expect(String(err.message)).not.toContain("TOKEN-123");
  });

  it("handles a non-JSON error response and a success without an id", async () => {
    const html = vi.fn().mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(sendWhatsAppText(input, { fetchImpl: html })).rejects.toMatchObject({ status: 502 });

    const noId = vi.fn().mockResolvedValue(jsonResponse({ messages: [] }));
    await expect(sendWhatsAppText(input, { fetchImpl: noId })).rejects.toThrow(/no message id/);
  });
});
