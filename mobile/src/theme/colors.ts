import { hslToHex, hexToHsl, relativeLuminance } from "./colorMath";

export type ColorScheme = "dark" | "light";

export type ThemeColors = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  inputBorder: string;
  text: string;
  textMuted: string;
  /** Fills: button/badge/chip backgrounds, with `accentText` printed on top. */
  accent: string;
  /** Ink: accent-coloured text, icons and borders drawn straight onto `bg`/`surface`. */
  accentInk: string;
  accentSoft: string;
  accentText: string;
  danger: string;
  dangerSoft: string;
  success: string;
  successSoft: string;
  info: string;
  infoSoft: string;
};

// Semantic colours (danger/success/info) are identity, not chrome, so they
// stay put across both schemes — same reasoning as leaving flatmates' own
// avatar colours alone. Only the surfaces/text below actually invert.
const brand = {
  danger: "#DC2626",
  dangerSoft: "rgba(220, 38, 38, 0.14)",
  // Matches the member colour-picker swatches on Settings, so a widget's
  // tint reads as part of the same palette as flatmates' own colours.
  success: "#22C55E",
  successSoft: "rgba(34, 197, 94, 0.14)",
  info: "#0EA5E9",
  infoSoft: "rgba(14, 165, 233, 0.14)",
};

export const darkColors: ThemeColors = {
  ...brand,
  bg: "#040405",
  surface: "#15161a",
  surfaceAlt: "#1c1d22",
  border: "#2c2f36",
  inputBorder: "#9298a3",
  text: "#ffffff",
  textMuted: "#9CA3AF",
  accent: "#ed4e04",
  accentInk: "#ed4e04",
  accentSoft: "rgba(237, 78, 4, 0.14)",
  accentText: "#1a0800",
};

// The dark chrome flipped: near-black bg becomes near-white, raised surfaces
// go lighter-than-bg rather than darker, and the text pair swaps ends. Kept
// slightly off-pure-white/black so the cards' borders and shadows still read.
// The brand accent inverts too — dark mode's orange becomes blue in light
// mode, so accentText flips from near-black (readable on orange) to white
// (readable on the darker blue fill).
export const lightColors: ThemeColors = {
  ...brand,
  bg: "#f9f7f4",
  surface: "#ffffff",
  surfaceAlt: "#ebebef",
  border: "#d7d9df",
  inputBorder: "#6b7280",
  text: "#0a0a0b",
  textMuted: "#6b7280",
  accent: "#2563EB",
  accentInk: "#2563EB",
  accentSoft: "rgba(37, 99, 235, 0.14)",
  accentText: "#ffffff",
};

export function paletteFor(scheme: ColorScheme): ThemeColors {
  return scheme === "light" ? lightColors : darkColors;
}

// The dashboard stack's own swatches. Fixed rather than scheme-dependent, for
// the same reason the semantic colours above are: the cards are solid blocks of
// colour, and a block that changed hue with the appearance toggle would read as
// a different card rather than the same one relit. Every one of them is a fill
// with `onColor` picking the text, so they're free to be as light or dark as
// they like. The set's red-orange is deliberately not here — it belongs to the
// selection bar, and a card wearing it would read as the selected one.
export const CARD_TONES = {
  lime: "#ddf57f",
  indigo: "#5849c6",
  lilac: "#dab8f5",
};

// The supporting set behind CARD_TONES: the deeper, softer and warmer
// neighbours of the three brights, for when something needs to sit *with* the
// palette without competing with it. Same rules as above — fixed across both
// schemes, used as fills with `onColor` picking the text. The note on each is
// what it's for, so a later choice can be made on purpose rather than by
// picking whichever hex looked nice.
export const PALETTE = {
  /** Grounds the bright colours — the one to reach for when a block has to recede. */
  deepNavy: "#202A5A",
  /** Bridges the green and blue. */
  teal: "#35AFA5",
  /** Softer companion to the lime. */
  mint: "#A8E6CF",
  /** Gives the palette breathing room — a page or panel tint rather than a block. */
  warmCream: "#FFF1D6",
  /** A darker partner for the orange. */
  terracotta: "#C94B32",
  /** Connects orange/coral to purple. */
  dustyRose: "#D9828B",
  /** Gives the lavender some depth. */
  deepPlum: "#6B3F78",
  /** Softens and extends the cobalt blue. */
  periwinkle: "#8B9BE8",
};

// Plate used by the calendar and the bills card on the dashboard. A
// near-black, blue-cast fill that stays the same across light/dark
// schemes so the calendar reads as a single panel.
export const CAL_PLATE = "#1b1f2a";
// The calendar's accent red — used for today's date, the month letters, and
// the weekday header's today column. Shared with the chores day strip so
// "today" reads the same everywhere.
export const CAL_RED = "#ff5a5f";
// Repaints the accent in the signed-in member's own colour.
//
// A pastel is bright enough to sit *under* dark text but far too pale to *be*
// text on a light page, so the accent splits in two: `accent` keeps the pastel
// and paints fills, while `accentInk` is the same hue deepened until it reads
// as ink. Dark mode needs no deepening — the pastel already carries against a
// near-black background, so there it plays both parts.
//
// The lightness floor covers members still holding a colour from the old vivid
// palette: those are dark enough that `accentText` would disappear into them,
// so they get lifted into pastel range. Anything picked from the current
// picker is already at or above the floor and passes through untouched.
export function accentedPalette(scheme: ColorScheme, memberColor: string | null): ThemeColors {
  const base = paletteFor(scheme);
  if (!memberColor || !/^#[0-9a-fA-F]{6}$/.test(memberColor)) return base;

  const { h, s, l } = hexToHsl(memberColor);
  const fill = hslToHex(h, s, Math.max(l, 0.8));
  const ink = scheme === "dark" ? fill : hslToHex(h, Math.max(s, 0.5), 0.34);

  return {
    ...base,
    accent: fill,
    accentInk: ink,
    accentSoft: withAlpha(ink, 0.16),
    // Matches the dark text member cards and chips already print on a
    // flatmate's colour, so a fill reads the same wherever it turns up.
    accentText: "rgba(0, 0, 0, 0.75)",
  };
}

// Black or white, whichever reads better printed on `hex` — for the places a
// theme colour becomes a solid fill and the scheme's own `text`/`textMuted`
// can't be trusted against it. Uses WCAG relative luminance and picks the
// higher of the two contrast ratios, so it flips at the point the eye does:
// deep blues and reds take white, pastels and mid-greys take black.
export function onColor(hex: string): string {
  const luminance = relativeLuminance(hex);

  // WCAG contrast is (lighter + 0.05) / (darker + 0.05); white's luminance is
  // 1 and black's is 0, which reduces these two to the expressions below.
  const againstWhite = 1.05 / (luminance + 0.05);
  const againstBlack = (luminance + 0.05) / 0.05;
  return againstWhite >= againstBlack ? "#ffffff" : "#000000";
}

// Fades a #rrggbb theme colour to a given opacity — used for gradients where
// a solid theme colour needs a translucent variant of itself.
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
