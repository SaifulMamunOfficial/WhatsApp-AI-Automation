"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/dal";
import { db } from "@/db";
import { assignOrder, createOrder, deleteOrder, setOrderStatus, updateOrder } from "./mutations";

// Server Actions are public HTTP endpoints: each one re-checks the session and validates its input.

export interface OrderFormState {
  error?: string;
  okAt?: number;
  /** Number of the order that was just created (for a confirmation message). */
  number?: number;
}

export interface OrderActionState {
  error?: string;
  okAt?: number;
}

const id = z.uuid();
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

function refresh(contactId?: string) {
  revalidatePath("/orders");
  revalidatePath("/inbox");
  revalidatePath("/contacts");
  if (contactId) revalidatePath(`/contacts/${contactId}`);
}

/** The form sends the item lines as one JSON field; anything that is not a list is rejected. */
function readFields(f: FormData): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  let items: unknown;
  try {
    items = JSON.parse(str(f, "items") || "[]");
  } catch {
    return { ok: false, error: "পণ্যের তালিকা পড়া যায়নি।" };
  }
  if (!Array.isArray(items)) return { ok: false, error: "পণ্যের তালিকা পড়া যায়নি।" };
  return {
    ok: true,
    fields: {
      kind: str(f, "kind"),
      priority: str(f, "priority") || "normal",
      title: str(f, "title"),
      note: str(f, "note"),
      deliveryName: str(f, "deliveryName"),
      deliveryPhone: str(f, "deliveryPhone"),
      deliveryAddress: str(f, "deliveryAddress"),
      courier: str(f, "courier"),
      trackingNumber: str(f, "trackingNumber"),
      appointmentAt: str(f, "appointmentAt"),
      items,
    },
  };
}

/** Create (no `orderId`) or edit (with `orderId`) from the same popup form. */
export async function saveOrderAction(_prev: OrderFormState, formData: FormData): Promise<OrderFormState> {
  const user = await requireUser();
  const read = readFields(formData);
  if (!read.ok) return { error: read.error };
  const actor = { id: user.id, role: user.role };

  const orderId = str(formData, "orderId");
  if (orderId) {
    const oid = id.safeParse(orderId);
    if (!oid.success) return { error: "ভুল অনুরোধ।" };
    const r = await updateOrder(db, oid.data, read.fields, actor);
    if (!r.ok) return { error: r.error };
    refresh(id.safeParse(formData.get("contactId")).data);
    return { okAt: Date.now() };
  }

  const contact = id.safeParse(formData.get("contactId"));
  if (!contact.success) return { error: "কন্টাক্ট বেছে নিন।" };
  const conv = str(formData, "conversationId");
  const convId = conv ? id.safeParse(conv) : null;
  if (convId && !convId.success) return { error: "ভুল অনুরোধ।" };

  const r = await createOrder(db, { contactId: contact.data, conversationId: convId ? convId.data : null, fields: read.fields }, actor);
  if (!r.ok) return { error: r.error };
  refresh(contact.data);
  return { okAt: Date.now(), number: r.number };
}

const statusSchema = z.enum(["pending", "in_progress", "resolved", "cancelled"]);

export async function setOrderStatusAction(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const user = await requireUser();
  const oid = id.safeParse(formData.get("orderId"));
  const to = statusSchema.safeParse(formData.get("status"));
  if (!oid.success || !to.success) return { error: "ভুল অনুরোধ।" };
  const r = await setOrderStatus(db, oid.data, to.data, { id: user.id, role: user.role });
  if (!r.ok) return { error: r.error };
  refresh();
  return { okAt: Date.now() };
}

export async function assignOrderAction(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const user = await requireUser();
  const oid = id.safeParse(formData.get("orderId"));
  const raw = str(formData, "userId");
  const target = raw === "" ? null : id.safeParse(raw);
  if (!oid.success || (target !== null && !target.success)) return { error: "ভুল অনুরোধ।" };
  const r = await assignOrder(db, oid.data, target ? target.data : null, { id: user.id, role: user.role });
  if (!r.ok) return { error: r.error };
  refresh();
  return { okAt: Date.now() };
}

export async function deleteOrderAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const oid = id.safeParse(formData.get("orderId"));
  if (!oid.success) return;
  await deleteOrder(db, oid.data, { id: user.id, role: user.role });
  refresh();
}
