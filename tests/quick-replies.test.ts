import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import {
  addQuickReply,
  deleteQuickReply,
  listQuickReplies,
  matchQuickReplies,
  MAX_BODY,
  normalizeShortcut,
  updateQuickReply,
  type QuickReply,
} from "@/core/inbox/quick-replies";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());
beforeEach(async () => {
  await t.db.delete(schema.quickReplies);
});

describe("normalizeShortcut", () => {
  it("drops the slash, lowercases and trims", () => {
    expect(normalizeShortcut(" /Office ")).toBe("office");
    expect(normalizeShortcut("//admission-2026")).toBe("admission-2026");
    expect(normalizeShortcut("a_b")).toBe("a_b");
  });
  it("rejects spaces, Bangla, empty and too long", () => {
    expect(normalizeShortcut("two words")).toBeNull();
    expect(normalizeShortcut("ফি")).toBeNull();
    expect(normalizeShortcut("/")).toBeNull();
    expect(normalizeShortcut("x".repeat(31))).toBeNull();
  });
});

describe("quick reply storage", () => {
  it("adds, lists (sorted) and trims the body", async () => {
    expect((await addQuickReply(t.db, { shortcut: "/Fee", body: "  ফি ৫০০০ টাকা  " })).ok).toBe(true);
    expect((await addQuickReply(t.db, { shortcut: "address", body: "মিরপুর, ঢাকা" })).ok).toBe(true);
    const all = await listQuickReplies(t.db);
    expect(all.map((r) => r.shortcut)).toEqual(["address", "fee"]);
    expect(all[1].body).toBe("ফি ৫০০০ টাকা");
  });

  it("rejects bad shortcut, empty or too long body, and duplicates (case-insensitive)", async () => {
    expect((await addQuickReply(t.db, { shortcut: "bad one", body: "x" })).ok).toBe(false);
    expect((await addQuickReply(t.db, { shortcut: "ok", body: "   " })).ok).toBe(false);
    expect((await addQuickReply(t.db, { shortcut: "ok", body: "x".repeat(MAX_BODY + 1) })).ok).toBe(false);
    await addQuickReply(t.db, { shortcut: "ok", body: "x" });
    expect((await addQuickReply(t.db, { shortcut: "/OK", body: "y" })).ok).toBe(false);
  });

  it("updates, keeps its own shortcut, and blocks another reply's shortcut", async () => {
    await addQuickReply(t.db, { shortcut: "a", body: "1" });
    await addQuickReply(t.db, { shortcut: "b", body: "2" });
    const [a, b] = await listQuickReplies(t.db);
    expect((await updateQuickReply(t.db, a.id, { shortcut: "a", body: "changed" })).ok).toBe(true);
    expect((await updateQuickReply(t.db, a.id, { shortcut: "b", body: "x" })).ok).toBe(false);
    expect((await listQuickReplies(t.db)).find((r) => r.id === a.id)?.body).toBe("changed");
    expect((await updateQuickReply(t.db, "00000000-0000-0000-0000-000000000000", { shortcut: "z", body: "x" })).ok).toBe(false);
    expect((await deleteQuickReply(t.db, b.id)).ok).toBe(true);
    expect((await deleteQuickReply(t.db, b.id)).ok).toBe(false);
  });
});

describe("matchQuickReplies", () => {
  const all: QuickReply[] = [
    { id: "1", shortcut: "office", body: "সকাল ১০টা থেকে রাত ১০টা" },
    { id: "2", shortcut: "fee", body: "ফি ৫০০০ টাকা" },
    { id: "3", shortcut: "free-trial", body: "ফ্রি ক্লাস আছে" },
    { id: "4", shortcut: "address", body: "Office is in Mirpur" },
  ];
  it("empty query shows everything", () => {
    expect(matchQuickReplies(all, "")).toHaveLength(4);
  });
  it("shortcuts that start with the text come first, then ones that contain it", () => {
    expect(matchQuickReplies(all, "fe").map((r) => r.id)).toEqual(["2"]);
    expect(matchQuickReplies(all, "of").map((r) => r.id)).toEqual(["1", "4"]); // 4 matches through its text
  });
  it("respects the limit and finds nothing for unknown text", () => {
    expect(matchQuickReplies(all, "", 2)).toHaveLength(2);
    expect(matchQuickReplies(all, "zzz")).toEqual([]);
  });
});
