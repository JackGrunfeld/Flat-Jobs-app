// Colour maths with no opinions in it. Split out from `colors.ts` so the
// palettes can depend on the maths and the member colours can depend on the
// palettes, without the three of them forming a circle.

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  const h =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { h: ((h * 60) % 360 + 360) % 360, s, l };
}

export function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

// WCAG relative luminance — how bright a colour actually reads, as opposed to
// how light its HSL says it is. The two part company badly across hues: a
// saturated yellow and a saturated blue at the same lightness are nowhere near
// equally readable, which is why anything picking text colour, or generating a
// set of swatches meant to be equally legible, works from this instead.
export function relativeLuminance(hex: string): number {
  const channel = (byte: number) => {
    const s = byte / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
    0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
    0.0722 * channel(parseInt(hex.slice(5, 7), 16))
  );
}

// Contrast of black ink printed on `hex`. WCAG contrast is
// (lighter + 0.05) / (darker + 0.05), and black's luminance is 0.
export const contrastWithBlack = (hex: string): number => (relativeLuminance(hex) + 0.05) / 0.05;

// Straight-line distance in RGB. Crude next to a proper perceptual metric, but
// it only has to answer "are these two close enough to be confused with each
// other", and for that it's honest enough.
export function rgbDistance(a: string, b: string): number {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

// The lightness at this hue and saturation whose colour reads at `target`
// luminance. Binary search rather than algebra: luminance is piecewise and
// gamma-corrected per channel, so there's no clean inverse, and 40 halvings
// lands well inside a rounding step of an 8-bit channel.
export function pitchToLuminance(h: number, s: number, target: number): string {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (relativeLuminance(hslToHex(h, s, mid)) < target) low = mid;
    else high = mid;
  }
  return hslToHex(h, s, high);
}
