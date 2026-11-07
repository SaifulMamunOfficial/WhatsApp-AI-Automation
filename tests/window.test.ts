import { describe, expect, it } from "vitest";
import { replyWindow } from "@/core/inbox/window";

const now = new Date("2026-03-10T12:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000);

describe("replyWindow", () => {
  it("is closed when the customer never wrote", () => {
    expect(replyWindow("whatsapp", null, { now, sender: "human" })).toEqual({ mode: "closed", reason: "no_customer_message" });
  });

  it("is open within 24h on both channels, for human and bot, with the exact boundary inclusive", () => {
    for (const ch of ["whatsapp", "messenger"] as const) {
      for (const sender of ["human", "bot"] as const) {
        expect(replyWindow(ch, ago(1), { now, sender }).mode).toBe("open");
        expect(replyWindow(ch, ago(24), { now, sender }).mode).toBe("open");
      }
    }
    const w = replyWindow("whatsapp", ago(2), { now, sender: "human" });
    expect(w.mode === "open" && w.closesAt.toISOString()).toBe("2026-03-11T10:00:00.000Z");
  });

  it("WhatsApp after 24h needs a template, even for a human", () => {
    expect(replyWindow("whatsapp", ago(25), { now, sender: "human" })).toEqual({ mode: "closed", reason: "template_required" });
    expect(replyWindow("whatsapp", ago(24 * 6), { now, sender: "human" }).mode).toBe("closed");
  });

  it("Messenger after 24h allows a human with the HUMAN_AGENT tag up to 7 days", () => {
    const w = replyWindow("messenger", ago(25), { now, sender: "human" });
    expect(w).toMatchObject({ mode: "human_agent_only", humanAgent: true });
    expect(replyWindow("messenger", ago(24 * 7), { now, sender: "human" }).mode).toBe("human_agent_only");
    expect(replyWindow("messenger", ago(24 * 7 + 1), { now, sender: "human" })).toEqual({ mode: "closed", reason: "expired" });
  });

  it("the bot can never use the HUMAN_AGENT window", () => {
    expect(replyWindow("messenger", ago(48), { now, sender: "bot" })).toEqual({ mode: "closed", reason: "expired" });
  });
});
