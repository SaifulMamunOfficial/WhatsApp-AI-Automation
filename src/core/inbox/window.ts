import type { ChannelType } from "@/channels/types";

// Reply-window rules per channel (see CLAUDE.md "চ্যানেলের নিয়ম").
//   WhatsApp : free-form text within 24h of the customer's last message, else template only.
//   Messenger: RESPONSE within 24h; a HUMAN (never the bot) may use the HUMAN_AGENT tag up to 7 days.

const HOUR = 60 * 60 * 1000;
export const STANDARD_WINDOW_MS = 24 * HOUR;
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * HOUR;

export type ReplyWindow =
  | { mode: "open"; humanAgent: false; closesAt: Date }
  | { mode: "human_agent_only"; humanAgent: true; closesAt: Date }
  | { mode: "closed"; reason: "no_customer_message" | "template_required" | "expired" };

export function replyWindow(
  channelType: ChannelType,
  lastCustomerMessageAt: Date | null,
  opts: { now?: Date; sender: "human" | "bot" },
): ReplyWindow {
  if (!lastCustomerMessageAt) return { mode: "closed", reason: "no_customer_message" };
  const now = (opts.now ?? new Date()).getTime();
  const age = now - lastCustomerMessageAt.getTime();

  if (age <= STANDARD_WINDOW_MS) {
    return { mode: "open", humanAgent: false, closesAt: new Date(lastCustomerMessageAt.getTime() + STANDARD_WINDOW_MS) };
  }
  if (channelType === "whatsapp") return { mode: "closed", reason: "template_required" };

  // Messenger: only a person may use the HUMAN_AGENT tag.
  if (opts.sender === "human" && age <= HUMAN_AGENT_WINDOW_MS) {
    return {
      mode: "human_agent_only",
      humanAgent: true,
      closesAt: new Date(lastCustomerMessageAt.getTime() + HUMAN_AGENT_WINDOW_MS),
    };
  }
  return { mode: "closed", reason: "expired" };
}
