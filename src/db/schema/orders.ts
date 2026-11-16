import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { contacts } from "./contacts";
import { conversations } from "./inbox";

export const orderKind = pgEnum("order_kind", ["order", "appointment", "complaint"]);
export const orderStatus = pgEnum("order_status", ["pending", "in_progress", "resolved", "cancelled"]);
export const orderPriority = pgEnum("order_priority", ["normal", "high"]);

// One customer request handled by the team: a product order, an appointment or a complaint.
// Money is whole taka (BDT), never fractions.
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Sequential, shown as ORD-0001. An identity column hands out numbers without races.
    number: integer("number").notNull().generatedAlwaysAsIdentity(),
    kind: orderKind("kind").notNull().default("order"),
    status: orderStatus("status").notNull().default("pending"),
    priority: orderPriority("priority").notNull().default("normal"),
    // An order is a business record: a contact that has orders cannot be deleted (merge moves them).
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "restrict" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    note: text("note"),
    deliveryName: text("delivery_name"),
    deliveryPhone: text("delivery_phone"),
    deliveryAddress: text("delivery_address"),
    courier: text("courier"),
    trackingNumber: text("tracking_number"),
    appointmentAt: timestamp("appointment_at", { withTimezone: true }),
    // Always the sum of the item lines, computed on the server.
    totalAmount: integer("total_amount").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("orders_number_idx").on(t.number),
    index("orders_status_idx").on(t.status),
    index("orders_contact_idx").on(t.contactId),
    index("orders_assigned_idx").on(t.assignedUserId),
    index("orders_created_idx").on(t.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

// Who changed what and when (status, assignee, edits). Append-only.
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    // created | status | assigned | edited
    type: text("type").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.createdAt)],
);
