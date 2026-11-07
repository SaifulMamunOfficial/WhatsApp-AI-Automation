import { z } from "zod";

// Shapes stored in automations.config (jsonb). Validated on read: a malformed row is
// skipped, never allowed to break message handling.

const text = z.string().trim().min(1).max(1000);

export const welcomeConfig = z.object({
  text,
  /** Send again when the customer comes back after this many idle hours. */
  idleHours: z.number().int().min(1).max(24 * 365).default(72),
});

export const keywordConfig = z.object({
  keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
  match: z.enum(["contains", "exact"]).default("contains"),
  reply: text,
});

export const officeHoursConfig = z.object({ text });

export const DEFAULT_HANDOFF_TEXT = "ধন্যবাদ! আপনার প্রশ্নটি আমাদের একজন প্রতিনিধিকে জানানো হয়েছে, তিনি শীঘ্রই উত্তর দেবেন।";

export const aiConfig = z.object({
  /** Sent when the AI cannot help and a person must take over. */
  handoffText: text.default(DEFAULT_HANDOFF_TEXT),
  /** Cost/loop guard: more AI replies than this per conversation per hour become a handoff. */
  maxRepliesPerHour: z.number().int().min(1).max(60).default(6),
});

export type WelcomeConfig = z.infer<typeof welcomeConfig>;
export type KeywordConfig = z.infer<typeof keywordConfig>;
export type OfficeHoursConfig = z.infer<typeof officeHoursConfig>;
export type AiConfig = z.infer<typeof aiConfig>;

export type Automation =
  | { id: string; kind: "welcome"; priority: number; channelId: string | null; config: WelcomeConfig }
  | { id: string; kind: "keyword"; priority: number; channelId: string | null; config: KeywordConfig }
  | { id: string; kind: "office_hours"; priority: number; channelId: string | null; config: OfficeHoursConfig }
  | { id: string; kind: "ai"; priority: number; channelId: string | null; config: AiConfig };

interface Row {
  id: string;
  kind: "welcome" | "keyword" | "office_hours" | "ai";
  priority: number;
  channelId: string | null;
  config: unknown;
}

/** Returns null for a row whose config is invalid. */
export function parseAutomation(row: Row): Automation | null {
  const base = { id: row.id, priority: row.priority, channelId: row.channelId };
  switch (row.kind) {
    case "welcome": {
      const c = welcomeConfig.safeParse(row.config);
      return c.success ? { ...base, kind: "welcome", config: c.data } : null;
    }
    case "keyword": {
      const c = keywordConfig.safeParse(row.config);
      return c.success ? { ...base, kind: "keyword", config: c.data } : null;
    }
    case "ai": {
      const c = aiConfig.safeParse(row.config ?? {});
      return c.success ? { ...base, kind: "ai", config: c.data } : null;
    }
    case "office_hours": {
      const c = officeHoursConfig.safeParse(row.config);
      return c.success ? { ...base, kind: "office_hours", config: c.data } : null;
    }
  }
}
