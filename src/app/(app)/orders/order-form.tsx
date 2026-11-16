"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { Alert, Field, buttonClass, cn, fieldClass } from "@/components/ui";
import { saveOrderAction, type OrderFormState } from "@/core/orders/actions";
import { MAX_ITEMS, type OrderKind, type OrderPriority } from "@/core/orders/rules";
import { useI18n } from "@/lib/i18n/client";
import { taka } from "@/lib/money";
import { KIND_LABEL } from "./labels";

export interface OrderFormData {
  id: string;
  contactId: string;
  kind: OrderKind;
  priority: OrderPriority;
  title: string;
  note: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  courier: string;
  trackingNumber: string;
  /** `yyyy-MM-ddTHH:mm` in the office time zone, for the datetime-local input. */
  appointmentAt: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  /** A finished order: only the note can change. */
  finished: boolean;
}

export interface ContactChoice {
  id: string;
  label: string;
}

interface Line {
  name: string;
  quantity: string;
  unitPrice: string;
}

const blankLine = (): Line => ({ name: "", quantity: "1", unitPrice: "" });

function OrderForm({
  order,
  contact,
  contacts,
  conversationId,
  onClose,
}: {
  order?: OrderFormData;
  contact?: ContactChoice;
  contacts?: ContactChoice[];
  conversationId?: string | null;
  onClose: () => void;
}) {
  const { t, num } = useI18n();
  const [state, action, pending] = useActionState<OrderFormState, FormData>(saveOrderAction, {});
  const [kind, setKind] = useState<OrderKind>(order?.kind ?? "order");
  const [lines, setLines] = useState<Line[]>(
    order ? order.items.map((i) => ({ name: i.name, quantity: String(i.quantity), unitPrice: String(i.unitPrice) })) : [blankLine()],
  );
  const [filter, setFilter] = useState("");
  const [pickedContact, setPickedContact] = useState(contact?.id ?? order?.contactId ?? "");

  useEffect(() => {
    if (state.okAt) onClose();
  }, [state.okAt, onClose]);

  const locked = order?.finished ?? false;
  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const usable = lines.filter((l) => l.name.trim() !== "");
  const json = JSON.stringify(usable.map((l) => ({ name: l.name, quantity: l.quantity, unitPrice: l.unitPrice || "0" })));
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const f = filter.trim().toLowerCase();
  const choices = (contacts ?? []).filter((c) => !f || c.label.toLowerCase().includes(f)).slice(0, 50);

  if (locked && order) {
    // A finished order: send every stored value back unchanged, and let only the note change.
    const keep = JSON.stringify(order.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })));
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="contactId" value={order.contactId} />
        <input type="hidden" name="items" value={keep} />
        {(["kind", "priority", "title", "appointmentAt", "deliveryName", "deliveryPhone", "deliveryAddress", "courier", "trackingNumber"] as const).map((k) => (
          <input key={k} type="hidden" name={k} value={order[k]} />
        ))}
        <Alert tone="info">{t("সমাধান বা বাতিল হওয়া অর্ডারের শুধু নোট বদলানো যায়। বদলাতে আগে আবার খুলুন।")}</Alert>
        <Field label={t("নোট")}>
          <textarea name="note" rows={4} maxLength={2000} defaultValue={order.note} autoFocus className={fieldClass} />
        </Field>
        {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>{t("বাতিল করুন")}</button>
          <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
            {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {t("হালনাগাদ")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {order ? <input type="hidden" name="orderId" value={order.id} /> : null}
      {order || contact ? <input type="hidden" name="contactId" value={order?.contactId ?? contact?.id} /> : null}
      {conversationId ? <input type="hidden" name="conversationId" value={conversationId} /> : null}
      <input type="hidden" name="items" value={json} />

      {!order && !contact && (
        <div className="space-y-2">
          <Field label={t("গ্রাহক (কন্টাক্ট)")}>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("নাম বা নম্বর দিয়ে খুঁজুন")} className={fieldClass} />
          </Field>
          <select name="contactId" required size={Math.min(5, Math.max(2, choices.length))} value={pickedContact} onChange={(e) => setPickedContact(e.target.value)} aria-label={t("গ্রাহক (কন্টাক্ট)")} className={fieldClass}>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          {choices.length === 0 && <p className="text-sm text-muted">{t("কোনো কন্টাক্ট মেলেনি।")}</p>}
        </div>
      )}
      {contact && !order && <p className="text-sm text-muted">{t("গ্রাহক")}: <span className="font-semibold text-fg">{contact.label}</span></p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("ধরন")}>
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as OrderKind)} className={fieldClass}>
            {(Object.keys(KIND_LABEL) as OrderKind[]).map((k) => (
              <option key={k} value={k}>{t(KIND_LABEL[k])}</option>
            ))}
          </select>
        </Field>
        <Field label={t("প্রায়োরিটি")}>
          <select name="priority" defaultValue={order?.priority ?? "normal"} className={fieldClass}>
            <option value="normal">{t("সাধারণ")}</option>
            <option value="high">{t("জরুরি")}</option>
          </select>
        </Field>
      </div>

      <Field label={t("শিরোনাম")}>
        <input name="title" required maxLength={200} defaultValue={order?.title} placeholder={t("যেমন: নেভি পাঞ্জাবি ২টা")} className={fieldClass} />
      </Field>

      {kind === "appointment" && (
        <Field label={t("অ্যাপয়েন্টমেন্টের সময়")}>
          <input name="appointmentAt" type="datetime-local" defaultValue={order?.appointmentAt} className={fieldClass} />
        </Field>
      )}

      {kind !== "appointment" && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">{t("পণ্য ও দাম (টাকা)")}</legend>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[4.5rem_1fr_2.25rem] items-center gap-2 sm:grid-cols-[1fr_4.5rem_6rem_2.25rem]">
              <input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} maxLength={120} aria-label={t("পণ্যের নাম")} placeholder={t("পণ্যের নাম")} className={cn(fieldClass, "col-span-3 sm:col-span-1")} />
              <input value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} type="number" min={1} step={1} inputMode="numeric" aria-label={t("সংখ্যা")} className={fieldClass} />
              <input value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} type="number" min={0} step={1} inputMode="numeric" aria-label={t("একক দাম")} placeholder={t("দাম")} className={fieldClass} />
              <button type="button" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, k) => k !== i) : [blankLine()]))} aria-label={t("লাইনটা সরান")} className="inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-danger">
                <Trash2 aria-hidden className="size-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <button type="button" disabled={lines.length >= MAX_ITEMS} onClick={() => setLines((ls) => [...ls, blankLine()])} className={buttonClass("secondary", "sm")}>
              <Plus aria-hidden className="size-4" />
              {t("লাইন যোগ করুন")}
            </button>
            <p className="text-sm font-bold">{t("মোট")}: {taka(num(total))}</p>
          </div>
        </fieldset>
      )}

      {kind === "order" && (
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-semibold">{t("ডেলিভারি")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("প্রাপকের নাম")}>
              <input name="deliveryName" maxLength={120} defaultValue={order?.deliveryName} className={fieldClass} />
            </Field>
            <Field label={t("ফোন")}>
              <input name="deliveryPhone" maxLength={30} inputMode="tel" defaultValue={order?.deliveryPhone} className={fieldClass} />
            </Field>
          </div>
          <Field label={t("ঠিকানা")}>
            <textarea name="deliveryAddress" rows={2} maxLength={500} defaultValue={order?.deliveryAddress} className={fieldClass} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("কুরিয়ার")}>
              <input name="courier" maxLength={80} defaultValue={order?.courier} className={fieldClass} />
            </Field>
            <Field label={t("ট্র্যাকিং নম্বর")}>
              <input name="trackingNumber" maxLength={80} defaultValue={order?.trackingNumber} className={fieldClass} />
            </Field>
          </div>
        </fieldset>
      )}

      <Field label={t("নোট")}>
        <textarea name="note" rows={3} maxLength={2000} defaultValue={order?.note} className={fieldClass} />
      </Field>

      {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className={buttonClass("secondary", "md")}>{t("বাতিল করুন")}</button>
        <button type="submit" disabled={pending || (!order && !contact && !pickedContact)} className={buttonClass("primary", "md")}>
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {order ? t("হালনাগাদ") : t("অর্ডার তৈরি করুন")}
        </button>
      </div>
    </form>
  );
}

/**
 * The create/edit popup. Create from a conversation or contact by passing `contact` (fixed);
 * from the orders page pass `contacts` to let the person pick one.
 */
export function OrderFormModal({
  open,
  onClose,
  order,
  contact,
  contacts,
  conversationId,
}: {
  open: boolean;
  onClose: () => void;
  order?: OrderFormData;
  contact?: ContactChoice;
  contacts?: ContactChoice[];
  conversationId?: string | null;
}) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={order ? t("অর্ডার সম্পাদনা") : t("নতুন অর্ডার")} size="lg">
      <OrderForm order={order} contact={contact} contacts={contacts} conversationId={conversationId} onClose={onClose} />
    </Modal>
  );
}
