export type ColorScheme = "dark" | "light";

export type ThemeColors = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  inputBorder: string;
  text: string;
  textMuted: string;
  accent: string;
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
  bg: "#f5f5f7",
  surface: "#ffffff",
  surfaceAlt: "#ebebef",
  border: "#d7d9df",
  inputBorder: "#6b7280",
  text: "#0a0a0b",
  textMuted: "#6b7280",
  accent: "#2563EB",
  accentSoft: "rgba(37, 99, 235, 0.14)",
  accentText: "#ffffff",
};

export function paletteFor(scheme: ColorScheme): ThemeColors {
  return scheme === "light" ? lightColors : darkColors;
}

// Fades a #rrggbb theme colour to a given opacity — used for gradients where
// a solid theme colour needs a translucent variant of itself.
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
