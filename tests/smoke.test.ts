import { describe, expect, it } from "vitest";
import type { NormalizedMessage } from "@/channels/types";

describe("test setup", () => {
  it("resolves the @ alias and channel types", () => {
    const msg: NormalizedMessage = {
      channelType: "whatsapp",
      channelExternalId: "106540352242922",
      externalId: "wamid.test",
      contactExternalId: "8801700000000",
      direction: "inbound",
      source: "api",
      type: "text",
      text: "hello",
      timestamp: new Date(0),
    };
    expect(msg.channelType).toBe("whatsapp");
  });
});
