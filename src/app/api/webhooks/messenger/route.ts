import { messengerAdapter } from "@/channels/messenger/adapter";
import { handleDelivery, handleVerification } from "@/channels/webhook-handler";
import { ingestEvents } from "@/core/inbox/ingest";
import { scheduleAutomations } from "@/core/automation/after-ingest";
import { db } from "@/db";

export async function GET(request: Request) {
  return handleVerification(new URL(request.url), process.env.META_WEBHOOK_VERIFY_TOKEN);
}

export async function POST(request: Request) {
  return handleDelivery(request, {
    adapter: messengerAdapter,
    ingest: async (events) => {
      const result = await ingestEvents(db, events);
      scheduleAutomations(result); // runs after the 200 is sent
      return result;
    },
    log: (message, err) => console.error(`[messenger-webhook] ${message}`, err),
  });
}
