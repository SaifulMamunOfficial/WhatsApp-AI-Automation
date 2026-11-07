import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ingestEvents } from "@/core/inbox/ingest";
import { addTagToContact, createTag, deleteTag, mergeContacts, removeTagFromContact, renameTag, updateContact } from "@/core/contacts/mutations";
import { getContactDetail, listContacts, listTagsWithCounts, searchContactsForMerge } from "@/core/contacts/queries";
import { importContactsCsv, MAX_IMPORT_ROWS } from "@/core/contacts/import";
import type { NormalizedMessage } from "@/channels/types";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let wa: string;
let fb: string;
const GHOST = "00000000-0000-0000-0000-000000000000";

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());

beforeEach(async () => {
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.tags);
  await t.db.delete(schema.channels);
  [{ id: wa }, { id: fb }] = await t.db
    .insert(schema.channels)
    .values([
      { type: "whatsapp", name: "WA", externalId: "PNID", isTest: true },
      { type: "messenger", name: "FB", externalId: "PAGE", isTest: true },
    ])
    .returning({ id: schema.channels.id });
});

const msg = (over: Partial<NormalizedMessage>): NormalizedMessage => ({
  channelType: "whatsapp", channelExternalId: "PNID", externalId: `m-${Math.random()}`, contactExternalId: "8801711000001",
  contactName: "Rahim", direction: "inbound", source: "api", type: "text", text: "hi", timestamp: new Date("2026-01-01T10:00:00Z"), ...over,
});
const contactIdOf = async (externalId: string) =>
  (await t.db.select().from(schema.contactIdentities).where(eq(schema.contactIdentities.externalId, externalId)))[0].contactId;

describe("contact + tag mutations", () => {
  it("updates name and notes (empty means cleared) with limits", async () => {
    await ingestEvents(t.db, { messages: [msg({})], statuses: [] });
    const id = await contactIdOf("8801711000001");
    expect((await updateContact(t.db, id, { name: "  রহিম উদ্দিন ", notes: "VIP" })).ok).toBe(true);
    expect((await t.db.select().from(schema.contacts))[0]).toMatchObject({ name: "রহিম উদ্দিন", notes: "VIP" });
    await updateContact(t.db, id, { name: "", notes: "" });
    expect((await t.db.select().from(schema.contacts))[0]).toMatchObject({ name: null, notes: null });
    expect((await updateContact(t.db, id, { name: "x".repeat(201), notes: "" })).ok).toBe(false);
    expect((await updateContact(t.db, id, { name: "a", notes: "x".repeat(5001) })).ok).toBe(false);
    expect((await updateContact(t.db, GHOST, { name: "a", notes: "" })).ok).toBe(false);
  });

  it("tag names are unique ignoring case; rename and color are validated", async () => {
    const vip = await createTag(t.db, "  VIP  ", "#ff0000");
    expect(vip.ok).toBe(true);
    expect((await createTag(t.db, "vip")).ok).toBe(false);
    expect((await createTag(t.db, "")).ok).toBe(false);
    expect((await createTag(t.db, "x".repeat(41))).ok).toBe(false);
    expect((await createTag(t.db, "bad-color", "red")).ok).toBe(false);
    const other = await createTag(t.db, "নতুন গ্রাহক");
    expect((await renameTag(t.db, other.id!, "VIP")).ok).toBe(false);
    expect((await renameTag(t.db, other.id!, "পুরনো গ্রাহক")).ok).toBe(true);
    expect((await renameTag(t.db, vip.id!, "vip")).ok).toBe(true); // renaming to its own name (case change) is fine
    expect((await renameTag(t.db, GHOST, "z")).ok).toBe(false);
  });

  it("assigns and removes tags idempotently; deleting a tag never deletes contacts", async () => {
    await ingestEvents(t.db, { messages: [msg({})], statuses: [] });
    const cid = await contactIdOf("8801711000001");
    const tag = (await createTag(t.db, "VIP")).id!;
    expect((await addTagToContact(t.db, cid, tag)).ok).toBe(true);
    expect((await addTagToContact(t.db, cid, tag)).ok).toBe(true); // second time: no error, no duplicate
    expect(await t.db.select().from(schema.contactTags)).toHaveLength(1);
    expect((await addTagToContact(t.db, GHOST, tag)).ok).toBe(false);
    expect((await listTagsWithCounts(t.db))[0]).toMatchObject({ name: "VIP", count: 1 });
    await removeTagFromContact(t.db, cid, tag);
    expect(await t.db.select().from(schema.contactTags)).toHaveLength(0);
    await addTagToContact(t.db, cid, tag);
    expect((await deleteTag(t.db, tag)).ok).toBe(true);
    expect(await t.db.select().from(schema.contactTags)).toHaveLength(0);
    expect(await t.db.select().from(schema.contacts)).toHaveLength(1);
    expect((await deleteTag(t.db, GHOST)).ok).toBe(false);
  });
});

describe("mergeContacts", () => {
  async function twoChannelPerson() {
    await ingestEvents(t.db, {
      statuses: [],
      messages: [
        msg({ externalId: "w1", text: "from whatsapp", timestamp: new Date("2026-01-01T10:00:00Z") }),
        msg({ externalId: "f1", channelType: "messenger", channelExternalId: "PAGE", contactExternalId: "PSID1", contactName: undefined, text: "from facebook", timestamp: new Date("2026-01-02T10:00:00Z") }),
      ],
    });
    return { keep: await contactIdOf("8801711000001"), gone: await contactIdOf("PSID1") };
  }

  it("moves identities, conversations and messages to the kept contact and deletes the other", async () => {
    const { keep, gone } = await twoChannelPerson();
    expect((await mergeContacts(t.db, keep, gone)).ok).toBe(true);

    const contacts = await t.db.select().from(schema.contacts);
    expect(contacts.map((c) => c.id)).toEqual([keep]);
    const identities = await t.db.select().from(schema.contactIdentities);
    expect(identities).toHaveLength(2);
    expect(identities.every((i) => i.contactId === keep)).toBe(true);
    const convs = await t.db.select().from(schema.conversations);
    expect(convs).toHaveLength(2);
    expect(convs.every((c) => c.contactId === keep)).toBe(true);
    expect(await t.db.select().from(schema.messages)).toHaveLength(2); // history untouched
  });

  it("unions tags, combines notes, and keeps the kept contact's name (the other fills a gap)", async () => {
    const { keep, gone } = await twoChannelPerson();
    await t.db.update(schema.contacts).set({ name: null, notes: "keep-note" }).where(eq(schema.contacts.id, keep));
    await t.db.update(schema.contacts).set({ name: "Facebook Name", notes: "gone-note" }).where(eq(schema.contacts.id, gone));
    const [a, b] = [(await createTag(t.db, "A")).id!, (await createTag(t.db, "B")).id!];
    await addTagToContact(t.db, keep, a);
    await addTagToContact(t.db, gone, a); // same tag on both
    await addTagToContact(t.db, gone, b);

    await mergeContacts(t.db, keep, gone);
    const [c] = await t.db.select().from(schema.contacts);
    expect(c).toMatchObject({ name: "Facebook Name", notes: "keep-note\n---\ngone-note" });
    const detail = await getContactDetail(t.db, keep);
    expect(detail!.tags.map((x) => x.name)).toEqual(["A", "B"]);
    expect(detail!.identities).toHaveLength(2);
    expect(detail!.conversations).toHaveLength(2);
  });

  it("refuses to merge a contact with itself or with one that does not exist, changing nothing", async () => {
    const { keep, gone } = await twoChannelPerson();
    expect((await mergeContacts(t.db, keep, keep)).ok).toBe(false);
    expect((await mergeContacts(t.db, keep, GHOST)).ok).toBe(false);
    expect((await mergeContacts(t.db, GHOST, gone)).ok).toBe(false);
    expect(await t.db.select().from(schema.contacts)).toHaveLength(2);
  });

  it("new messages after a merge land in the merged contact's existing conversation", async () => {
    const { keep, gone } = await twoChannelPerson();
    await mergeContacts(t.db, keep, gone);
    await ingestEvents(t.db, { statuses: [], messages: [msg({ externalId: "f2", channelType: "messenger", channelExternalId: "PAGE", contactExternalId: "PSID1", contactName: undefined, text: "again" })] });
    expect(await t.db.select().from(schema.contacts)).toHaveLength(1);
    expect(await t.db.select().from(schema.conversations)).toHaveLength(2); // no new conversation created
  });
});

describe("listContacts / detail", () => {
  beforeEach(async () => {
    await ingestEvents(t.db, {
      statuses: [],
      messages: [
        msg({ externalId: "a", contactExternalId: "8801711000001", contactName: "Rahim Uddin", timestamp: new Date("2026-01-01T10:00:00Z") }),
        msg({ externalId: "b", contactExternalId: "8801822000002", contactName: "Karim", timestamp: new Date("2026-01-03T10:00:00Z") }),
        msg({ externalId: "c", channelType: "messenger", channelExternalId: "PAGE", contactExternalId: "PSID9", contactName: "Sumaiya", timestamp: new Date("2026-01-02T10:00:00Z") }),
      ],
    });
    await importContactsCsv(t.db, { channelId: wa, csv: "name,phone\nNever Messaged,01933000003", dryRun: false });
  });

  it("orders by last activity (never-messaged last) and includes identities and tags", async () => {
    const tag = (await createTag(t.db, "VIP")).id!;
    await addTagToContact(t.db, await contactIdOf("8801822000002"), tag);
    const { items, total } = await listContacts(t.db, {});
    expect(total).toBe(4);
    expect(items.map((i) => i.name)).toEqual(["Karim", "Sumaiya", "Rahim Uddin", "Never Messaged"]);
    expect(items[0].tags.map((x) => x.name)).toEqual(["VIP"]);
    expect(items[1].identities).toMatchObject([{ channelType: "messenger", externalId: "PSID9" }]);
    expect(items[3].lastMessageAt).toBeNull();
    // The actual values, not just the order (a broken subquery once returned null for everyone).
    expect(items.slice(0, 3).map((i) => i.lastMessageAt?.toISOString())).toEqual(["2026-01-03T10:00:00.000Z", "2026-01-02T10:00:00.000Z", "2026-01-01T10:00:00.000Z"]);
  });

  it("filters by search (name, number), tag and channel; wildcards are literal", async () => {
    const tag = (await createTag(t.db, "VIP")).id!;
    await addTagToContact(t.db, await contactIdOf("8801822000002"), tag);
    expect((await listContacts(t.db, { q: "rahim" })).items.map((i) => i.name)).toEqual(["Rahim Uddin"]);
    expect((await listContacts(t.db, { q: "0182200" })).items.map((i) => i.name)).toEqual(["Karim"]);
    expect((await listContacts(t.db, { tagId: tag })).items.map((i) => i.name)).toEqual(["Karim"]);
    expect((await listContacts(t.db, { channelType: "messenger" })).items.map((i) => i.name)).toEqual(["Sumaiya"]);
    expect((await listContacts(t.db, { q: "%" })).total).toBe(0);
    expect((await listContacts(t.db, { q: "_" })).total).toBe(0);
  });

  it("paginates and clamps the page number", async () => {
    expect((await listContacts(t.db, { page: -3 })).page).toBe(1);
    expect((await listContacts(t.db, { page: 99 })).items).toEqual([]);
  });

  it("finds merge candidates excluding the contact itself; detail returns null for unknown ids", async () => {
    const rahim = await contactIdOf("8801711000001");
    const found = await searchContactsForMerge(t.db, "Karim", rahim);
    expect(found.map((f) => f.name)).toEqual(["Karim"]);
    expect(await searchContactsForMerge(t.db, "Rahim", rahim)).toEqual([]);
    expect(await getContactDetail(t.db, GHOST)).toBeNull();
  });
});

describe("importContactsCsv", () => {
  const run = (csv: string, over: Partial<Parameters<typeof importContactsCsv>[1]> = {}) =>
    importContactsCsv(t.db, { channelId: wa, csv, dryRun: false, ...over });

  it("creates contacts with normalized numbers, names and tags (separators ; | ,)", async () => {
    const r = await run('নাম,মোবাইল,ট্যাগ\nরহিম,01711-000001,"VIP; নতুন"\nকরিম,+880 1811 000002,"ঢাকা|VIP"\n');
    expect(r).toMatchObject({ created: 2, updated: 0, errors: [], tagsCreated: 3, duplicatesInFile: 0 });
    const identities = await t.db.select().from(schema.contactIdentities);
    expect(identities.map((i) => i.externalId).sort()).toEqual(["8801711000001", "8801811000002"]);
    expect(identities.every((i) => i.channelId === wa)).toBe(true);
    const tags = await listTagsWithCounts(t.db);
    expect(tags.map((x) => `${x.name}:${x.count}`).sort()).toEqual(["VIP:2", "ঢাকা:1", "নতুন:1"]);
  });

  it("reports bad rows with line numbers and imports the good ones", async () => {
    const r = await run("name,phone\nA,01711000001\nB,abc\nC,\nD,01811000002\n");
    expect(r.created).toBe(2);
    expect(r.errors).toEqual([
      { line: 3, message: expect.stringContaining("abc") },
      { line: 4, message: expect.stringContaining("ফোন নম্বর ঠিক নয়") },
    ]);
  });

  it("never overwrites an existing name, adds tags, and counts existing numbers as updated", async () => {
    await run("name,phone\nOriginal Name,01711000001");
    const r = await run("name,phone,tags\nDifferent,8801711000001,Returning", { extraTag: "Batch2" });
    expect(r).toMatchObject({ created: 0, updated: 1 });
    expect((await t.db.select().from(schema.contacts))[0].name).toBe("Original Name");
    expect((await t.db.select().from(schema.contactTags))).toHaveLength(2);
    expect(await t.db.select().from(schema.contacts)).toHaveLength(1);
  });

  it("repeated numbers in one file are counted, not duplicated; tag names match ignoring case", async () => {
    const r = await run("name,phone,tags\nA,01711000001,vip\nA again,+8801711000001,VIP\n");
    expect(r).toMatchObject({ created: 1, duplicatesInFile: 1, tagsCreated: 1 });
    expect(await t.db.select().from(schema.contactIdentities)).toHaveLength(1);
  });

  it("dry run reports the outcome but saves nothing (including tags)", async () => {
    const r = await run("name,phone,tags\nA,01711000001,NewTag\nB,zzz,\n", { dryRun: true });
    expect(r).toMatchObject({ dryRun: true, created: 1, tagsCreated: 1 });
    expect(r.errors).toHaveLength(1);
    expect(await t.db.select().from(schema.contacts)).toHaveLength(0);
    expect(await t.db.select().from(schema.tags)).toHaveLength(0);
  });

  it("rejects a bad file or channel without touching anything", async () => {
    expect((await run("name,email\nA,a@x.com")).fatal).toContain("ফোন নম্বরের কলাম");
    expect((await run("")).fatal).toBeDefined();
    expect((await run("name,phone\n")).fatal).toBeDefined();
    expect((await importContactsCsv(t.db, { channelId: fb, csv: "name,phone\nA,01711000001", dryRun: false })).fatal).toContain("WhatsApp");
    expect((await importContactsCsv(t.db, { channelId: GHOST, csv: "name,phone\nA,01711000001", dryRun: false })).fatal).toBeDefined();
    expect((await run("name,phone\nA,01711000001", { extraTag: "x".repeat(41) })).fatal).toContain("৪০");
    const tooMany = "name,phone\n" + Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `n${i},017110${String(10000 + i).padStart(5, "0")}`).join("\n");
    expect((await run(tooMany)).fatal).toContain(String(MAX_IMPORT_ROWS));
    expect(await t.db.select().from(schema.contacts)).toHaveLength(0);
  });

  it("an imported contact later messaging joins the same contact (no duplicate person)", async () => {
    await run("name,phone\nImported Name,01711000001");
    await ingestEvents(t.db, { statuses: [], messages: [msg({ contactExternalId: "8801711000001", contactName: "Profile Name" })] });
    const contacts = await t.db.select().from(schema.contacts);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe("Imported Name"); // the business's own label wins over the profile name
  });
});
