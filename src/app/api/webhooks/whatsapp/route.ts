import { whatsappAdapter } from "@/channels/whatsapp/adapter";
import { handleDelivery, handleVerification } from "@/channels/webhook-handler";
import { ingestEvents } from "@/core/inbox/ingest";
import { queueAfterIngest } from "@/core/jobs/after-ingest";
import { db } from "@/db";

export async function GET(request: Request) {
  return handleVerification(new URL(request.url), process.env.META_WEBHOOK_VERIFY_TOKEN);
}

export async function POST(request: Request) {
  return handleDelivery(request, {
    adapter: whatsappAdapter,
    ingest: async (events) => {
      const result = await ingestEvents(db, events);
      await queueAfterIngest(result); // durable queue (falls back to running after the 200 if it cannot be written)
      return result;
    },
    log: (message, err) => console.error(`[whatsapp-webhook] ${message}`, err),
  });
}
