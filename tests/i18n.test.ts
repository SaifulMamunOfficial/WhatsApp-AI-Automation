import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { EN } from "@/lib/i18n/en";
import { translate } from "@/lib/i18n";

const ROOT = join(__dirname, "..", "src");
const BN = /[ঀ-৿]/;

// Files whose Bangla is NOT admin/staff UI text: customer-facing defaults, matching rules and the
// AI prompt (customers read Bangla whatever language the staff UI is in), plus the dictionary itself.
const NOT_UI = [
  "lib/i18n/",
  "core/ai/answer.ts",
  "core/ai/retrieve.ts",
  "core/automation/config.ts",
  "core/automation/text.ts",
  "core/automation/admin.ts",
  "core/contacts/phone.ts",
  "core/contacts/csv.ts",
  "core/contacts/consent.ts",
  "core/inbox/window.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

/** Removes // and block comments (not the // inside "https://..." strings). */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const files = walk(ROOT).filter((f) => !NOT_UI.some((n) => relative(ROOT, f).replace(/\\/g, "/").startsWith(n)));

describe("UI language coverage", () => {
  it("every Bangla string literal has an English translation", () => {
    const missing: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, "utf8"));
      const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
      for (const m of code.matchAll(re)) {
        const raw = m[1] ?? m[2] ?? m[3] ?? "";
        if (!BN.test(raw)) continue;
        // JS escapes -> the actual string (good enough for these literals)
        const text = raw.replace(/\\(["'`\\])/g, "$1").replace(/\\n/g, "\n");
        const hasExpr = /\$\{/.test(text);
        const ok = hasExpr
          ? translate("en", text.replace(/\$\{[^}]*\}/g, "7")) !== text.replace(/\$\{[^}]*\}/g, "7")
          : EN[text] !== undefined || translate("en", text) !== text;
        if (!ok) missing.push(`${relative(ROOT, f).replace(/\\/g, "/")}: ${text.slice(0, 90)}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("no Bangla text is left outside string literals in UI files (untranslated JSX text)", () => {
    const left: string[] = [];
    for (const f of files) {
      const code = stripComments(readFileSync(f, "utf8")).replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
      code.split("\n").forEach((line, i) => {
        if (BN.test(line)) left.push(`${relative(ROOT, f).replace(/\\/g, "/")}:${i + 1}: ${line.trim().slice(0, 90)}`);
      });
    }
    expect(left).toEqual([]);
  });

  it("every English entry keeps the same {placeholders} as its Bangla key", () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const bad = Object.entries(EN).filter(([k, v]) => JSON.stringify(names(k)) !== JSON.stringify(names(v))).map(([k]) => k.slice(0, 80));
    expect(bad).toEqual([]);
  });
});

describe("translate", () => {
  it("returns the English text, filling values", () => {
    expect(translate("en", "খোলা {n}", { n: 5 })).toBe("5 open");
  });
  it("keeps Bangla as is in Bangla, filling values", () => {
    expect(translate("bn", "খোলা {n}", { n: "৫" })).toBe("খোলা ৫");
  });
  it("translates rendered core messages by pattern", () => {
    expect(translate("en", "নোট সর্বোচ্চ 5000 অক্ষরের হতে পারে।")).toBe("A note can be at most 5000 characters.");
  });
  it("falls back to the source text when there is no translation", () => {
    expect(translate("en", "কোনো অজানা লেখা")).toBe("কোনো অজানা লেখা");
    expect(translate("en", "Meta error 190")).toBe("Meta error 190");
  });
});
