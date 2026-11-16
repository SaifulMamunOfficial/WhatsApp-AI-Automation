import type { OrderKind, OrderStatus } from "@/core/orders/rules";

// Shared by server and client components (so this file must not be a "use client" module).
export const KIND_LABEL: Record<OrderKind, string> = { order: "অর্ডার", appointment: "অ্যাপয়েন্টমেন্ট", complaint: "অভিযোগ" };
export const STATUS_LABEL: Record<OrderStatus, string> = { pending: "অপেক্ষায়", in_progress: "চলছে", resolved: "সমাধান", cancelled: "বাতিল" };
export const STATUS_TONE: Record<OrderStatus, "warning" | "info" | "success" | "neutral"> = { pending: "warning", in_progress: "info", resolved: "success", cancelled: "neutral" };
