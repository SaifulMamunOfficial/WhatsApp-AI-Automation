import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { ContactSyncEvent } from "@/channels/types";
import { ensureIdentityByKey, type Db } from "@/core/inbox/ingest";

/**
 * Applies contacts from the WhatsApp Business App address book (Coexistence state sync).
 *
 *  - "add" (Meta uses it for edits too): create/update the contact and take the phone's saved
 *    name, which is the business's own label and so wins over the customer's profile name.
 *  - "remove": deliberately ignored. Deleting a contact on the phone must not erase
 *    conversations and notes the team keeps in the CRM.
 *
 * Returns the number of contacts added/updated.
 */
export async function ingestContactSync(db: Db, events: ContactSyncEvent[]): Promise<number> {
  let applied = 0;
  const syncedPerChannel = new Map<string, number>();

  for (const e of events) {
    if (e.action !== "add") continue;

    const [channel] = await db
      .select({ id: schema.channels.id })
      .from(schema.channels)
      .where(and(eq(schema.channels.type, e.channelType), eq(schema.channels.externalId, e.channelExternalId)))
      .limit(1);
    if (!channel) continue;

    const name = e.fullName ?? e.firstName;
    await db.transaction(async (tx) => {
      const identity = await ensureIdentityByKey(tx, channel.id, e.contactExternalId, name);
      if (name) {
        await tx
          .update(schema.contacts)
          .set({ name, updatedAt: new Date() })
          .where(eq(schema.contacts.id, identity.contactId));
        await tx
          .update(schema.contactIdentities)
          .set({ displayName: name })
          .where(eq(schema.contactIdentities.id, identity.id));
      }
    });
    applied++;
    syncedPerChannel.set(channel.id, (syncedPerChannel.get(channel.id) ?? 0) + 1);
  }

  const s = schema.whatsappSyncState;
  for (const [channelId, n] of syncedPerChannel) {
    await db
      .update(s)
      .set({ contactsSyncedCount: sql`${s.contactsSyncedCount} + ${n}`, updatedAt: new Date() })
      .where(eq(s.channelId, channelId));
  }
  return applied;
}
