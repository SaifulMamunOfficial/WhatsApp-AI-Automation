import { whatsappAdapter } from "@/channels/whatsapp/adapter";
import { handleDelivery, handleVerification } from "@/channels/webhook-handler";
import { ingestEvents } from "@/core/inbox/ingest";
import { db } from "@/db";

export async function GET(request: Request) {
  return handleVerification(new URL(request.url), process.env.META_WEBHOOK_VERIFY_TOKEN);
}

export async function POST(request: Request) {
  return handleDelivery(request, {
    adapter: whatsappAdapter,
    ingest: (events) => ingestEvents(db, events),
    log: (message, err) => console.error(`[whatsapp-webhook] ${message}`, err),
  });
}
