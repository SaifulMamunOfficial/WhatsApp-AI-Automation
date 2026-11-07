import { describe, expect, it } from "vitest";
import { detectDelimiter, mapHeaders, parseCsv } from "@/core/contacts/csv";
import { normalizePhone } from "@/core/contacts/phone";

describe("parseCsv", () => {
  it("parses quotes, escaped quotes, commas and newlines inside quotes", () => {
    const rows = parseCsv('name,phone,note\n"Rahim, Md",01711000001,"said ""hi""\nthen left"\nKarim,01811000002,\n');
    expect(rows).toEqual([
      ["name", "phone", "note"],
      ["Rahim, Md", "01711000001", 'said "hi"\nthen left'],
      ["Karim", "01811000002", ""],
    ]);
  });

  it("handles a BOM, CRLF line endings and blank lines", () => {
    expect(parseCsv("﻿name,phone\r\nA,1\r\n\r\nB,2\r\n")).toEqual([["name", "phone"], ["A", "1"], ["B", "2"]]);
  });

  it("detects semicolon and tab delimiters (Excel exports)", () => {
    expect(detectDelimiter("name;phone;tags")).toBe(";");
    expect(detectDelimiter("name\tphone")).toBe("\t");
    expect(detectDelimiter("name,phone")).toBe(",");
    expect(parseCsv("নাম;ফোন\nরহিম;০১৭১১০০০০০১")).toEqual([["নাম", "ফোন"], ["রহিম", "০১৭১১০০০০০১"]]);
  });

  it("keeps a trailing field without a final newline and returns [] for empty input", () => {
    expect(parseCsv("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
});

describe("mapHeaders", () => {
  it("finds columns by English or Bengali names, case-insensitively", () => {
    expect(mapHeaders(["Name", "Mobile", "Tags"])).toEqual({ name: 0, phone: 1, tags: 2 });
    expect(mapHeaders(["নাম", "মোবাইল", "ট্যাগ"])).toEqual({ name: 0, phone: 1, tags: 2 });
    expect(mapHeaders(["id", "WhatsApp"])).toEqual({ phone: 1 });
    expect(mapHeaders(["x", "y"])).toEqual({});
  });
});

describe("normalizePhone", () => {
  it("normalizes the many ways Bangladeshi numbers are written", () => {
    for (const input of ["01711-000001", "01711 000001", "+880 1711-000001", "8801711000001", "008801711000001", "1711000001", "০১৭১১০০০০০১", "+৮৮০১৭১১০০০০০১"]) {
      expect(normalizePhone(input)).toBe("8801711000001");
    }
  });

  it("accepts plausible international numbers and rejects junk", () => {
    expect(normalizePhone("+1 (650) 555-1234")).toBe("16505551234");
    expect(normalizePhone("+44 7911 123456")).toBe("447911123456");
    for (const bad of ["", "abc", "123", "0171100", "01211000001", "0201234567", "1".repeat(16)]) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });
});
