import { relativeLuminance } from "./colorMath";

// A card face sitting on a flatmate's own colour follows that colour rather
// than the theme — member colours never invert, and a pastel takes black ink
// while a deep one takes white. Shared by the chores roster cards and the
// bills balance cards so a flatmate's block reads identically on both tabs.
export type CardInk = {
  /** The flatmate's name and the tick box / amount. */
  strong: string;
  /** Chips: their text and their outline. */
  body: string;
  muted: string;
  hairline: string;
  /** Sits inside a filled badge, so it has to be the card colour itself. */
  onStrong: string;
};

export const BLACK_INK: CardInk = {
  strong: "#000000",
  body: "rgba(0,0,0,0.78)",
  muted: "rgba(0,0,0,0.5)",
  hairline: "rgba(0,0,0,0.12)",
  onStrong: "#ffffff",
};

export const WHITE_INK: CardInk = {
  strong: "#ffffff",
  body: "rgba(255,255,255,0.88)",
  muted: "rgba(255,255,255,0.65)",
  hairline: "rgba(255,255,255,0.2)",
  onStrong: "#000000",
};

// Luminance, not HSL lightness: a saturated yellow and a saturated blue can
// claim the same lightness and be nowhere near equally readable in black.
export function inkFor(background: string): CardInk {
  if (!/^#[0-9a-fA-F]{6}$/.test(background)) return BLACK_INK;
  return relativeLuminance(background) > 0.35 ? BLACK_INK : WHITE_INK;
}
