import { describe, expect, it, beforeEach } from "vitest";
import { createTestDb } from "./helpers/test-db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { calculateBusinessWaitMinutes, getSlaBadge, loadActiveHolidays } from "@/core/inbox/sla";
import {
  createLifecycleStage,
  deleteLifecycleStage,
  listLifecycleStages,
  updateContactStage,
  updateLifecycleStage,
} from "@/core/contacts/stages";
import { transferConversation } from "@/core/inbox/transfer";
import { exportContactsCsv, sanitizeCsvCell } from "@/core/contacts/export";
import { checkDraftRateLimit, resetDraftRateLimiter } from "@/core/ai/draft";

describe("Sprint 1 Core Features", () => {
  describe("Feature 1: SLA Wait Time & Office Hours Calculation", () => {
    const hours = { tz: "Asia/Dhaka", open: "10:00", close: "22:00" };
    const holidays = [
      { startDate: "2026-11-20", endDate: "2026-11-20", enabled: true },
    ];

    it("calculates zero wait minutes when now is equal to or before message time", () => {
      const t = new Date("2026-11-15T12:00:00Z");
      expect(calculateBusinessWaitMinutes(t, t, hours, holidays)).toBe(0);
    });

    it("calculates exact minutes during active office hours", () => {
      // 11:00 to 11:30 Dhaka time
      // Dhaka is UTC+6. 11:00 Dhaka = 05:00 UTC. 11:30 Dhaka = 05:30 UTC.
      const start = new Date("2026-11-15T05:00:00Z");
      const end = new Date("2026-11-15T05:30:00Z");
      expect(calculateBusinessWaitMinutes(start, end, hours, holidays)).toBe(30);
    });

    it("ignores overnight hours outside office open/close", () => {
      // Message arrives at 23:00 Dhaka time (17:00 UTC).
      // Now is next morning 09:30 Dhaka time (03:30 UTC).
      // Both are outside 10:00-22:00, so business elapsed minutes must be 0!
      const start = new Date("2026-11-15T17:00:00Z");
      const end = new Date("2026-11-16T03:30:00Z");
      expect(calculateBusinessWaitMinutes(start, end, hours, holidays)).toBe(0);
    });

    it("calculates cross-day minutes including open hours only", () => {
      // Message at 21:00 Dhaka (15:00 UTC) -> 1 hour left on Day 1.
      // Checked at 11:00 Dhaka next day (05:00 UTC) -> 1 hour passed after 10:00 open.
      // Total business minutes: 60 + 60 = 120 minutes!
      const start = new Date("2026-11-15T15:00:00Z");
      const end = new Date("2026-11-16T05:00:00Z");
      expect(calculateBusinessWaitMinutes(start, end, hours, holidays)).toBe(120);
    });

    it("excludes active holidays completely", () => {
      // Message on 2026-11-19 at 21:00 Dhaka (15:00 UTC) -> 60 mins.
      // 2026-11-20 is a holiday -> 0 mins.
      // Checked on 2026-11-21 at 11:00 Dhaka (05:00 UTC) -> 60 mins.
      // Total: 60 + 0 + 60 = 120 minutes!
      const start = new Date("2026-11-19T15:00:00Z");
      const end = new Date("2026-11-21T05:00:00Z");
      expect(calculateBusinessWaitMinutes(start, end, hours, holidays)).toBe(120);
    });

    it("loads active holidays from database and applies to SLA calculation", async () => {
      const t = await createTestDb();
      try {
        await t.db.insert(schema.holidays).values([
          { name: "Eid", startDate: "2026-11-20", endDate: "2026-11-20", text: "Holiday", enabled: true },
          { name: "Old", startDate: "2026-11-10", endDate: "2026-11-10", text: "Old", enabled: false },
        ]);

        const dbHolidays = await loadActiveHolidays(t.db);
        expect(dbHolidays.length).toBe(1);
        expect(dbHolidays[0].startDate).toBe("2026-11-20");

        const start = new Date("2026-11-19T15:00:00Z");
        const end = new Date("2026-11-21T05:00:00Z");
        expect(calculateBusinessWaitMinutes(start, end, hours, dbHolidays)).toBe(120);
      } finally {
        await t.close();
      }
    }, 15000);

    it("assigns green, yellow, and red badges correctly with localized digits and >15 rule", () => {
      // Bangla digits by default
      expect(getSlaBadge(3)).toMatchObject({ color: "green", label: "৩মি অপেক্ষা" });
      expect(getSlaBadge(8)).toMatchObject({ color: "yellow", label: "৮মি অপেক্ষা" });
      // Exactly 15 minutes is yellow (plan: >15 is red)
      expect(getSlaBadge(15)).toMatchObject({ color: "yellow", label: "১৫মি অপেক্ষা" });
      // 16 minutes is red
      expect(getSlaBadge(16)).toMatchObject({ color: "red", label: "১৬মি অপেক্ষা" });
      expect(getSlaBadge(90)).toMatchObject({ color: "red", label: "১ঘ ৩০মি অপেক্ষা" });

      // English digits when locale is en
      expect(getSlaBadge(3, "en")).toMatchObject({ color: "green", label: "3m wait" });
      expect(getSlaBadge(15, "en")).toMatchObject({ color: "yellow", label: "15m wait" });
      expect(getSlaBadge(16, "en")).toMatchObject({ color: "red", label: "16m wait" });
    });
  });

  describe("Feature 2: Dynamic Lifecycle Stages & RBAC", () => {
    it("manages stages and enforces role permissions", async () => {
      const t = await createTestDb();
      try {
        // Migration seeded initial stages
        const initial = await listLifecycleStages(t.db);
        expect(initial.length).toBeGreaterThanOrEqual(7);
        const def = initial.find((s) => s.isDefault);
        expect(def?.name).toBe("New Lead");

        // Agent cannot create stage
        const agentCreate = await createLifecycleStage(t.db, { name: "VIP", colorKey: "violet" }, "agent");
        expect(agentCreate.ok).toBe(false);
        expect(agentCreate).toMatchObject({ code: "forbidden" });

        // Admin can create stage
        const adminCreate = await createLifecycleStage(t.db, { name: "VIP Customer", colorKey: "violet" }, "admin");
        expect(adminCreate.ok).toBe(true);

        // Cannot create with invalid color
        const badColor = await createLifecycleStage(t.db, { name: "Test", colorKey: "#ff0000" }, "admin");
        expect(badColor.ok).toBe(false);
        expect(badColor).toMatchObject({ code: "invalid_input" });

        // Update stage
        if (adminCreate.ok) {
          const updateRes = await updateLifecycleStage(t.db, adminCreate.data.id, { name: "VIP Member" }, "admin");
          expect(updateRes.ok).toBe(true);
        }

        // Default stage deletion is rejected
        if (def) {
          const delDef = await deleteLifecycleStage(t.db, def.id, "admin");
          expect(delDef.ok).toBe(false);
          expect(delDef).toMatchObject({ code: "conflict" });
        }

        // Contact stage change: Agent is allowed
        const [contact] = await t.db.insert(schema.contacts).values({ name: "Rahim" }).returning();
        if (adminCreate.ok) {
          const changeRes = await updateContactStage(t.db, contact.id, adminCreate.data.id, "agent");
          expect(changeRes.ok).toBe(true);

          const [updatedContact] = await t.db.select().from(schema.contacts).where(eq(schema.contacts.id, contact.id));
          expect(updatedContact.stageId).toBe(adminCreate.data.id);
        }
      } finally {
        await t.close();
      }
    });
  });

  describe("Feature 4: Chat Transfer & Internal Note", () => {
    it("enforces transfer permissions strictly and saves handover notes", async () => {
      const t = await createTestDb();
      try {
        const [admin] = await t.db.insert(schema.users).values({ name: "Admin", email: "admin@test.com", role: "admin", passwordHash: "h" }).returning();
        const [agent1] = await t.db.insert(schema.users).values({ name: "Agent 1", email: "agent1@test.com", role: "agent", passwordHash: "h" }).returning();
        const [agent2] = await t.db.insert(schema.users).values({ name: "Agent 2", email: "agent2@test.com", role: "agent", passwordHash: "h" }).returning();
        const [channel] = await t.db.insert(schema.channels).values({ type: "whatsapp", name: "WA", externalId: "wa1", status: "active" }).returning();
        const [contact] = await t.db.insert(schema.contacts).values({ name: "Customer" }).returning();
        const [identity] = await t.db.insert(schema.contactIdentities).values({ channelId: channel.id, contactId: contact.id, externalId: "8801700" }).returning();

        // 1. Unassigned conversation: Agent 1 cannot transfer an unassigned conversation
        const [unassignedConv] = await t.db.insert(schema.conversations).values({
          channelId: channel.id,
          contactId: contact.id,
          identityId: identity.id,
          assignedUserId: null,
          botPaused: false,
        }).returning();

        const agentTransferUnassigned = await transferConversation(
          t.db,
          { conversationId: unassignedConv.id, toUserId: agent2.id },
          { id: agent1.id, name: agent1.name, role: agent1.role },
        );
        expect(agentTransferUnassigned.ok).toBe(false);
        expect(agentTransferUnassigned).toMatchObject({ code: "forbidden" });

        // Admin CAN transfer an unassigned conversation
        const adminTransferUnassigned = await transferConversation(
          t.db,
          { conversationId: unassignedConv.id, toUserId: agent1.id, note: "Admin assigned" },
          { id: admin.id, name: admin.name, role: admin.role },
        );
        expect(adminTransferUnassigned.ok).toBe(true);

        // 2. Conversation assigned to Agent 1
        // Agent 2 attempts to transfer Agent 1's chat -> Rejected
        const unauthorized = await transferConversation(
          t.db,
          { conversationId: unassignedConv.id, toUserId: agent2.id },
          { id: agent2.id, name: agent2.name, role: agent2.role },
        );
        expect(unauthorized.ok).toBe(false);
        expect(unauthorized).toMatchObject({ code: "forbidden" });

        // Agent 1 transfers their OWN chat to Agent 2 with note -> Allowed
        const success = await transferConversation(
          t.db,
          { conversationId: unassignedConv.id, toUserId: agent2.id, note: "পেমেন্ট নিয়ে আলোচনা বাকি আছে।" },
          { id: agent1.id, name: agent1.name, role: agent1.role },
        );
        expect(success.ok).toBe(true);

        // Verify conversation updated: assigned to Agent 2, botPaused = true
        const [after] = await t.db.select().from(schema.conversations).where(eq(schema.conversations.id, unassignedConv.id));
        expect(after.assignedUserId).toBe(agent2.id);
        expect(after.botPaused).toBe(true);

        // Verify note saved in conversationNotes table
        const notes = await t.db.select().from(schema.conversationNotes).where(eq(schema.conversationNotes.conversationId, unassignedConv.id));
        expect(notes.length).toBe(2); // 1 from admin, 1 from agent 1
        expect(notes[1].body).toBe("পেমেন্ট নিয়ে আলোচনা বাকি আছে।");
        expect(notes[1].userId).toBe(agent1.id);
      } finally {
        await t.close();
      }
    });
  });

  describe("Feature 5: Contacts CSV Export & Formula Injection Sanitization", () => {
    it("sanitizes CSV formula injection triggers", () => {
      expect(sanitizeCsvCell("=1+2")).toBe(`"'=1+2"`);
      expect(sanitizeCsvCell("+cmd|' /C calc'!'A1'")).toBe(`"'+cmd|' /C calc'!'A1'"`);
      expect(sanitizeCsvCell("-SUM(A1:A10)")).toBe(`"'-SUM(A1:A10)"`);
      expect(sanitizeCsvCell("@alert")).toBe(`"'@alert"`);
      expect(sanitizeCsvCell("Normal Name")).toBe(`"Normal Name"`);
      expect(sanitizeCsvCell(`Say "Hello"`)).toBe(`"Say ""Hello"""`);
    });

    it("allows only admin to export contacts and aggregates multiple identities per contact", async () => {
      const t = await createTestDb();
      try {
        const agentRes = await exportContactsCsv(t.db, {}, "agent");
        expect(agentRes.ok).toBe(false);
        expect(agentRes).toMatchObject({ code: "forbidden" });

        // Insert a contact with TWO identities (WhatsApp and FB)
        const [contact] = await t.db.insert(schema.contacts).values({ name: "Multi Channel User" }).returning();
        const [ch1] = await t.db.insert(schema.channels).values({ type: "whatsapp", name: "WA", externalId: "wa1", status: "active" }).returning();
        const [ch2] = await t.db.insert(schema.channels).values({ type: "messenger", name: "FB", externalId: "fb1", status: "active" }).returning();
        await t.db.insert(schema.contactIdentities).values([
          { channelId: ch1.id, contactId: contact.id, externalId: "+8801700000000" },
          { channelId: ch2.id, contactId: contact.id, externalId: "psid_998877" },
        ]);

        // Insert a conversation with lastCustomerMessageAt
        await t.db.insert(schema.conversations).values({
          channelId: ch1.id,
          contactId: contact.id,
          identityId: (await t.db.select().from(schema.contactIdentities).where(eq(schema.contactIdentities.contactId, contact.id)).limit(1))[0].id,
          lastCustomerMessageAt: new Date("2026-11-14T10:00:00Z"),
        });

        const adminRes = await exportContactsCsv(t.db, {}, "admin");
        expect(adminRes.ok).toBe(true);
        if (adminRes.ok) {
          expect(adminRes.csvContent.startsWith("\uFEFF")).toBe(true); // UTF-8 BOM
          // The contact must appear in EXACTLY 1 row, with both IDs aggregated
          expect(adminRes.count).toBe(1);
          expect(adminRes.csvContent).toContain("+8801700000000");
          expect(adminRes.csvContent).toContain("psid_998877");
          expect(adminRes.csvContent).toContain("2026-11-14"); // Last contact date
        }

        // Test filtering by last contact date
        const matchedFilter = await exportContactsCsv(t.db, { fromLastContactDate: "2026-11-14", toLastContactDate: "2026-11-14" }, "admin");
        expect(matchedFilter.ok && matchedFilter.count).toBe(1);

        const outOfRangeFilter = await exportContactsCsv(t.db, { fromLastContactDate: "2026-11-16" }, "admin");
        expect(outOfRangeFilter.ok && outOfRangeFilter.count).toBe(0);
      } finally {
        await t.close();
      }
    });
  });

  describe("Feature 3: AI Draft Rate Limiter", () => {
    beforeEach(() => {
      resetDraftRateLimiter();
    });

    it("enforces rate limit of 10 requests per minute", () => {
      const user = "user-test-123";
      const now = Date.now();

      for (let i = 0; i < 10; i++) {
        expect(checkDraftRateLimit(user, now)).toBe(true);
      }

      // 11th request must be blocked
      expect(checkDraftRateLimit(user, now)).toBe(false);

      // After 61 seconds, request should be allowed again
      expect(checkDraftRateLimit(user, now + 61_000)).toBe(true);
    });
  });
});
