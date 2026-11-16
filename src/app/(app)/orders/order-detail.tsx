"use client";

import { CalendarClock, Loader2, MapPin, MessageSquare, Pencil, Phone, Trash2, Truck, User } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { ConfirmAction } from "@/components/confirm-action";
import { Modal } from "@/components/modal";
import { Alert, Badge, buttonClass, cn, fieldClass } from "@/components/ui";
import { assignOrderAction, deleteOrderAction, setOrderStatusAction, type OrderActionState } from "@/core/orders/actions";
import { canChangeStatus, isOpen, type OrderKind, type OrderPriority, type OrderStatus, type Role } from "@/core/orders/rules";
import { useI18n } from "@/lib/i18n/client";
import { taka } from "@/lib/money";
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE } from "./labels";
import type { OrderFormData } from "./order-form";

export interface OrderDetailView extends OrderFormData {
  label: string;
  status: OrderStatus;
  contactName: string;
  conversationId: string | null;
  assignedUserId: string | null;
  assigneeName: string | null;
  total: number;
  createdText: string;
  appointmentText: string | null;
  events: { id: string; text: string; at: string }[];
}

export interface TeamChoice {
  id: string;
  name: string;
}

const ACTIONS: { to: OrderStatus; label: string; style: "primary" | "secondary" | "danger" }[] = [
  { to: "in_progress", label: "কাজ শুরু", style: "secondary" },
  { to: "resolved", label: "সমাধান হয়েছে", style: "primary" },
  { to: "cancelled", label: "বাতিল করুন", style: "danger" },
  { to: "pending", label: "আবার খুলুন", style: "secondary" },
];

function StatusButtons({ order, role }: { order: OrderDetailView; role: Role }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<OrderActionState, FormData>(setOrderStatusAction, {});
  const list = ACTIONS.filter((a) => canChangeStatus(order.status, a.to, role));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {list.map((a) => (
          <form key={a.to} action={action}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="status" value={a.to} />
            <button type="submit" disabled={pending} className={buttonClass(a.style, "sm")}>
              {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
              {t(a.to === "pending" && isOpen(order.status) ? "অপেক্ষায় ফেরান" : a.label)}
            </button>
          </form>
        ))}
        {list.length === 0 && <p className="text-sm text-muted">{t("শেষ হওয়া অর্ডার শুধু অ্যাডমিন আবার খুলতে পারেন।")}</p>}
      </div>
      {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
    </div>
  );
}

function AssignControl({ order, viewer, team }: { order: OrderDetailView; viewer: { id: string; role: Role }; team: TeamChoice[] }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<OrderActionState, FormData>(assignOrderAction, {});
  const mine = order.assignedUserId === viewer.id;

  return (
    <div className="space-y-2">
      {viewer.role === "admin" ? (
        <form action={action} className="flex flex-wrap items-center gap-2" key={order.assignedUserId ?? "none"}>
          <input type="hidden" name="orderId" value={order.id} />
          <select name="userId" defaultValue={order.assignedUserId ?? ""} aria-label={t("দায়িত্ব")} className={cn(fieldClass, "!min-h-9 !w-auto min-w-40 !py-1")}>
            <option value="">{t("অনির্ধারিত")}</option>
            {team.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>{t("ঠিক করুন")}</button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          {order.assignedUserId === null && (
            <form action={action}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="userId" value={viewer.id} />
              <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>{t("আমি নিচ্ছি")}</button>
            </form>
          )}
          {mine && (
            <form action={action}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="userId" value="" />
              <button type="submit" disabled={pending} className={buttonClass("secondary", "sm")}>{t("ছেড়ে দিচ্ছি")}</button>
            </form>
          )}
        </div>
      )}
      {state.error && <Alert tone="danger">{t(state.error)}</Alert>}
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span aria-hidden className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

export function OrderDetailModal({
  order,
  viewer,
  team,
  onClose,
  onEdit,
}: {
  order: OrderDetailView | null;
  viewer: { id: string; role: Role };
  team: TeamChoice[];
  onClose: () => void;
  onEdit: (o: OrderDetailView) => void;
}) {
  const { t, num } = useI18n();
  return (
    <Modal open={order !== null} onClose={onClose} title={order ? `${order.label} · ${t(KIND_LABEL[order.kind as OrderKind])}` : ""} size="lg">
      {order && (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 flex-1 text-base font-bold">{order.title}</h3>
              <Badge tone={STATUS_TONE[order.status]}>{t(STATUS_LABEL[order.status])}</Badge>
              {(order.priority as OrderPriority) === "high" && <Badge tone="danger">{t("জরুরি")}</Badge>}
            </div>
            <Row icon={<User className="size-4" />}>
              <Link href={`/contacts/${order.contactId}`} className="font-semibold text-brand hover:underline">{order.contactName}</Link>
              {order.conversationId && (
                <Link href={`/inbox?c=${order.conversationId}`} className="ml-3 inline-flex items-center gap-1 text-brand hover:underline">
                  <MessageSquare aria-hidden className="size-3.5" />
                  {t("চ্যাট খুলুন")}
                </Link>
              )}
            </Row>
            {order.appointmentText && <Row icon={<CalendarClock className="size-4" />}>{order.appointmentText}</Row>}
            {(order.deliveryName || order.deliveryPhone) && (
              <Row icon={<Phone className="size-4" />}>{[order.deliveryName, order.deliveryPhone].filter(Boolean).join(" · ")}</Row>
            )}
            {order.deliveryAddress && <Row icon={<MapPin className="size-4" />}>{order.deliveryAddress}</Row>}
            {(order.courier || order.trackingNumber) && <Row icon={<Truck className="size-4" />}>{[order.courier, order.trackingNumber].filter(Boolean).join(" · ")}</Row>}
            <p className="text-xs text-muted">{t("তৈরি")}: {order.createdText}</p>
          </div>

          {order.items.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {order.items.map((i, k) => (
                    <tr key={k}>
                      <td className="px-3 py-2">{i.name}</td>
                      <td className="px-3 py-2 text-right text-muted">{num(i.quantity)} × {taka(num(i.unitPrice))}</td>
                      <td className="px-3 py-2 text-right font-semibold">{taka(num(i.quantity * i.unitPrice))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-2/60">
                    <td className="px-3 py-2 font-bold" colSpan={2}>{t("মোট")}</td>
                    <td className="px-3 py-2 text-right font-bold">{taka(num(order.total))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {order.note && (
            <div>
              <h4 className="mb-1 text-sm font-semibold">{t("নোট")}</h4>
              <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm">{order.note}</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t("অবস্থা বদলান")}</h4>
              <StatusButtons order={order} role={viewer.role} />
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">{t("দায়িত্ব")}: <span className="font-normal text-muted">{order.assigneeName ?? t("অনির্ধারিত")}</span></h4>
              <AssignControl order={order} viewer={viewer} team={team} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <button type="button" onClick={() => onEdit(order)} className={buttonClass("secondary", "md")}>
              <Pencil aria-hidden className="size-4" />
              {t("সম্পাদনা")}
            </button>
            {viewer.role === "admin" && order.status === "cancelled" && (
              <ConfirmAction
                action={deleteOrderAction}
                fields={{ orderId: order.id }}
                title={t("অর্ডার মুছুন")}
                message={t("{label} মুছে ফেলবেন? এটা ফেরানো যায় না।", { label: order.label })}
                confirmLabel={t("মুছুন")}
                danger
                className={buttonClass("secondary", "md", "text-danger")}
              >
                <Trash2 aria-hidden className="size-4" />
                {t("মুছুন")}
              </ConfirmAction>
            )}
          </div>

          {order.events.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">{t("ইতিহাস")}</h4>
              <ul className="space-y-1.5 text-xs text-muted">
                {order.events.map((e) => (
                  <li key={e.id}>
                    <span className="font-medium text-fg">{e.at}</span> · {e.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
