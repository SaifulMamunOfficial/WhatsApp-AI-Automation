import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { addKeywordRule, deleteAutomation, saveSimpleAutomation, setAutomationEnabled, setBotEnabled } from "@/core/automation/admin";
import { parseAutomation } from "@/core/automation/config";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());
beforeEach(async () => {
  await t.db.delete(schema.automations);
  await t.db.delete(schema.channels);
});
const rows = () => t.db.select().from(schema.automations);

describe("automation admin", () => {
  it("saves welcome/office text as a single global row, keeping the idleHours it does not edit", async () => {
    expect((await saveSimpleAutomation(t.db, "welcome", "স্বাগতম", true)).ok).toBe(true);
    await t.db.update(schema.automations).set({ config: { text: "old", idleHours: 12 } });
    expect((await saveSimpleAutomation(t.db, "welcome", "নতুন", false)).ok).toBe(true);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ kind: "welcome", enabled: false, config: { text: "নতুন", idleHours: 12 } });
    expect((await saveSimpleAutomation(t.db, "office_hours", "বন্ধ", true)).ok).toBe(true);
    expect(await rows()).toHaveLength(2);
  });

  it("rejects empty or oversized text", async () => {
    expect((await saveSimpleAutomation(t.db, "welcome", "   ", true)).ok).toBe(false);
    expect((await saveSimpleAutomation(t.db, "office_hours", "x".repeat(1001), true)).ok).toBe(false);
    expect(await rows()).toHaveLength(0);
  });

  it("adds keyword rules (comma / Bengali comma / newline), producing a valid config", async () => {
    const r = await addKeywordRule(t.db, { keywordsCsv: "1, মূল্য،price\nদাম", reply: "ফি ৫০০০", match: "contains" });
    expect(r.ok).toBe(true);
    const [row] = await rows();
    const a = parseAutomation({ id: row.id, kind: row.kind, priority: row.priority, channelId: row.channelId, config: row.config });
    expect(a).toMatchObject({ kind: "keyword", config: { keywords: ["1", "মূল্য", "price", "দাম"], reply: "ফি ৫০০০" } });
    expect(row.name).toBe("1");
  });

  it("new keyword rules go after existing ones; invalid input adds nothing", async () => {
    await addKeywordRule(t.db, { keywordsCsv: "a", reply: "A", match: "exact" });
    await addKeywordRule(t.db, { keywordsCsv: "b", reply: "B", match: "exact" });
    const [first, second] = (await rows()).sort((x, y) => x.priority - y.priority);
    expect(first.priority).toBeLessThan(second.priority);
    expect((await addKeywordRule(t.db, { keywordsCsv: " , ", reply: "x", match: "contains" })).ok).toBe(false);
    expect((await addKeywordRule(t.db, { keywordsCsv: "a", reply: "", match: "contains" })).ok).toBe(false);
    expect(await rows()).toHaveLength(2);
  });

  it("toggles and deletes rules, and reports unknown ids", async () => {
    await addKeywordRule(t.db, { keywordsCsv: "a", reply: "A", match: "contains" });
    const [row] = await rows();
    expect((await setAutomationEnabled(t.db, row.id, false)).ok).toBe(true);
    expect((await rows())[0].enabled).toBe(false);
    expect((await deleteAutomation(t.db, row.id)).ok).toBe(true);
    expect(await rows()).toHaveLength(0);
    const ghost = "00000000-0000-0000-0000-000000000000";
    expect((await deleteAutomation(t.db, ghost)).ok).toBe(false);
    expect((await setAutomationEnabled(t.db, ghost, true)).ok).toBe(false);
  });

  it("switches a channel's bot on and off", async () => {
    const [ch] = await t.db.insert(schema.channels).values({ type: "whatsapp", name: "WA", externalId: "1" }).returning({ id: schema.channels.id });
    expect((await t.db.select().from(schema.channels).where(eq(schema.channels.id, ch.id)))[0].botEnabled).toBe(false);
    expect((await setBotEnabled(t.db, ch.id, true)).ok).toBe(true);
    expect((await t.db.select().from(schema.channels))[0].botEnabled).toBe(true);
    expect((await setBotEnabled(t.db, "00000000-0000-0000-0000-000000000000", true)).ok).toBe(false);
  });
});
