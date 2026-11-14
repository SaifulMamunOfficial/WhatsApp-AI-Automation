// WCAG contrast check for the design tokens in src/app/globals.css.
// Every text/background pair must be >= 4.5:1 in BOTH themes. Keep these values identical to
// globals.css; run with `npm run design:contrast` after any colour change.
const lum = (hex) => {
  const c = hex.replace("#", "").match(/../g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Palette: WhatsApp's own brand colours. The logo green #25D366 is too light for text
// (white on it is 1.9:1), so it is DECORATION ONLY (logo tile with a dark-teal glyph, glow,
// channel dot). Text, buttons and links use WhatsApp's deeper teal (#00735E, a deepened WhatsApp Web
// header colour). Neutrals and bubbles follow WhatsApp Web (light grey app, pale-green outgoing
// bubble; navy-charcoal dark theme with a deep-green outgoing bubble).
const light = {
  bg: "#FAF9F6", surface: "#FFFFFF", surface2: "#F3F2EE", fg: "#1B1A17", muted: "#6A675F",
  brand: "#C2410C", brandFg: "#FFFFFF", brandSoft: "#FFEFE2", brandHover: "#9A3412",
  gradLight: "#C94607", gradDark: "#B03A0A",
  bubbleOut: "#FFE9D6", bubbleOutFg: "#1B1A17", bubbleOutMuted: "#6B4A33",
  danger: "#C62828", dangerSoft: "#FDECEA", warning: "#7A5200", warningSoft: "#FBF0CF",
  success: "#0F6B3B", successSoft: "#DCF3E4", info: "#0B5FB0", infoSoft: "#E1F0FB",
  whatsapp: "#167A3E", whatsappSoft: "#DCFCE7", messenger: "#0A5BD6", messengerSoft: "#E1EBFF",
  glyphOnLogo: "#1B1A17", logo: "#FF6A13",
};
const dark = {
  bg: "#141311", surface: "#1E1D1A", surface2: "#2A2825", fg: "#F2EFE8", muted: "#A8A398",
  brand: "#FF8A3D", brandFg: "#1B1A17", brandSoft: "#3A2314", brandHover: "#FFA05E",
  gradLight: "#FFA05E", gradDark: "#FF8A3D",
  bubbleOut: "#5A2E12", bubbleOutFg: "#F2EFE8", bubbleOutMuted: "#E0C4AE",
  danger: "#FF8F85", dangerSoft: "#3E1F1C", warning: "#F2C14E", warningSoft: "#3A2F12",
  success: "#5FD08F", successSoft: "#14301F", info: "#7CC4F2", infoSoft: "#173246",
  whatsapp: "#4ADE80", whatsappSoft: "#14301F", messenger: "#8DB2FF", messengerSoft: "#1C2A4A",
  glyphOnLogo: "#1B1A17", logo: "#FF6A13",
};

const pairs = (t) => [
  ["fg on bg", t.fg, t.bg], ["fg on surface", t.fg, t.surface], ["muted on bg", t.muted, t.bg],
  ["muted on surface", t.muted, t.surface], ["muted on surface-2", t.muted, t.surface2],
  ["brand on bg (links)", t.brand, t.bg], ["brand on surface (links)", t.brand, t.surface],
  ["brand on brand-soft", t.brand, t.brandSoft], ["brand on surface-2", t.brand, t.surface2],
  ["brand-fg on brand (button)", t.brandFg, t.brand], ["brand-fg on brand-hover", t.brandFg, t.brandHover],
  ["brand-fg on gradient start", t.brandFg, t.gradLight], ["brand-fg on gradient end", t.brandFg, t.gradDark],
  ["bubble-out text", t.bubbleOutFg, t.bubbleOut], ["bubble-out time/status", t.bubbleOutMuted, t.bubbleOut],
  ["danger on danger-soft", t.danger, t.dangerSoft], ["danger on surface", t.danger, t.surface],
  ["warning on warning-soft", t.warning, t.warningSoft], ["success on success-soft", t.success, t.successSoft],
  ["info on info-soft", t.info, t.infoSoft], ["whatsapp on whatsapp-soft", t.whatsapp, t.whatsappSoft],
  ["messenger on messenger-soft", t.messenger, t.messengerSoft], ["fg on warning-soft", t.fg, t.warningSoft],
  ["fg on danger-soft", t.fg, t.dangerSoft], ["fg on success-soft", t.fg, t.successSoft],
  ["fg on info-soft", t.fg, t.infoSoft],
];
// Graphics (not text) need 3:1.
const graphics = (t) => [["logo glyph on logo green (graphic, 3:1)", t.glyphOnLogo, t.logo, 3]];

let bad = 0;
let total = 0;
for (const [name, t] of [["LIGHT", light], ["DARK", dark]]) {
  console.log(`\n${name}`);
  for (const [label, a, b, min = 4.5] of [...pairs(t), ...graphics(t)]) {
    const r = ratio(a, b);
    total++;
    const ok = r >= min;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${r.toFixed(2).padStart(5)}  ${label}`);
  }
}
console.log(bad ? `\n${bad} of ${total} pair(s) below their minimum` : `\nall ${total} pairs meet their minimum (text 4.5:1, graphics 3:1)`);
process.exit(bad ? 1 : 0);
