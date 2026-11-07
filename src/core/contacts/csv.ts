// A small RFC 4180 CSV parser (quotes, escaped quotes, newlines inside quotes, BOM) with
// delimiter detection, so a file saved from Excel (comma, semicolon or tab) just works.

export function detectDelimiter(firstLine: string): "," | ";" | "\t" {
  const count = (d: string) => firstLine.split(d).length - 1;
  const [c, s, t] = [count(","), count(";"), count("\t")];
  if (t > c && t > s) return "\t";
  if (s > c) return ";";
  return ",";
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ColumnKey = "name" | "phone" | "tags";

const HEADERS: Record<ColumnKey, string[]> = {
  name: ["name", "full name", "fullname", "customer", "নাম", "গ্রাহক"],
  phone: ["phone", "mobile", "number", "phone number", "whatsapp", "contact", "ফোন", "মোবাইল", "নম্বর", "হোয়াটসঅ্যাপ"],
  tags: ["tags", "tag", "label", "labels", "ট্যাগ", "লেবেল"],
};

/** Maps header cells to our columns by common English/Bengali names. */
export function mapHeaders(header: string[]): Partial<Record<ColumnKey, number>> {
  const out: Partial<Record<ColumnKey, number>> = {};
  header.forEach((cell, i) => {
    const h = cell.trim().toLowerCase();
    for (const key of Object.keys(HEADERS) as ColumnKey[]) {
      if (out[key] === undefined && HEADERS[key].includes(h)) out[key] = i;
    }
  });
  return out;
}
