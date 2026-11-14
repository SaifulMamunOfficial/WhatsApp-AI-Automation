// A channel's bot setting, shown to admins as one choice instead of two switches.
//   off          the bot never answers on this channel
//   after_hours  the bot answers only when the office is closed (outside office hours, or a holiday)
//   always       the bot answers any time (staff replies still pause it per conversation)
// Stored as two columns: channels.bot_enabled (master switch) and channels.bot_after_hours_only.

export type BotMode = "off" | "after_hours" | "always";

export const BOT_MODES: BotMode[] = ["off", "after_hours", "always"];

export const isBotMode = (v: unknown): v is BotMode => BOT_MODES.includes(v as BotMode);

export function botModeOf(c: { botEnabled: boolean; botAfterHoursOnly: boolean }): BotMode {
  return !c.botEnabled ? "off" : c.botAfterHoursOnly ? "after_hours" : "always";
}

export function botModeColumns(mode: BotMode): { botEnabled: boolean; botAfterHoursOnly: boolean } {
  return { botEnabled: mode !== "off", botAfterHoursOnly: mode === "after_hours" };
}
