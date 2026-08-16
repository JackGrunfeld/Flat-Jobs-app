import { CARD_TONES } from "./colors";
import { contrastWithBlack, pitchToLuminance, rgbDistance } from "./colorMath";

// Flatmate colours — the ones a member picks for themselves on Settings, and
// the wheel they pick from.
//
// Two hard rules shape every colour reachable here.
//
// 1. It is always a FILL with near-black ink printed on it. The roster's chore
//    cards, the member cards, the chips and every avatar put #272525 or
//    rgba(0,0,0,0.75) straight onto a flatmate's colour, so a colour that
//    can't carry that text isn't a colour a flatmate can have — however good
//    it looks as a swatch. That's what INK_FLOOR is: the point below which the
//    text on top starts to fail. It's a luminance rather than a lightness
//    because the two disagree wildly across hues, and a lightness floor would
//    have let saturated blues through while needlessly barring yellows.
//
// 2. It can't be one of the dashboard's own card colours. Those three are the
//    identity of the Chores, Balance and Shopping cards; a flatmate wearing
//    one would read as belonging to a card rather than to themselves. The
//    presets below simply aren't near them, and the wheel steps around them.
//
// Within those, the aim is the opposite of what this file used to hold: the
// old set was ten near-white pastels that were hard to tell apart at avatar
// size, which is the one job a member colour has. These are saturated, spread
// around the hue circle, and each one answers to a colour in the app's own
// palette (see PALETTE in colors.ts) so they belong to the same world.

// 7:1 against black — enough headroom that the 75%-opacity ink most of these
// surfaces use still clears the 4.5:1 the text would need on its own.
const INK_FLOOR = 0.34;
// How close is too close, as a straight line through RGB. Two member colours
// nearer than this are hard to tell apart on a 24pt avatar, and a colour this
// near a card tone reads as that card's colour.
const CONFUSION_RADIUS = 40;

const RESERVED = Object.values(CARD_TONES);

export const isReservedColor = (hex: string): boolean =>
  RESERVED.some((tone) => rgbDistance(hex, tone) < CONFUSION_RADIUS);

// Eight, spread around the circle, each pitched deep enough to be a colour
// rather than a tint and light enough to carry the ink. The brand colour each
// one answers to is noted — several of those are far too dark to be a member
// colour themselves (Deep Navy carries black text at 1.5:1), so what's here is
// that colour's hue brought up into the readable band rather than the colour
// itself.
export const MEMBER_PRESETS = [
  "#f17641", // Coral — Terracotta, lifted
  "#eea30d", // Amber — the warm end of Warm Cream, with the saturation put back
  "#53de8d", // Mint
  "#14b0b0", // Teal
  "#3cb6e9", // Sky — Periwinkle, cooled toward cyan to clear Periwinkle below
  "#8598f5", // Periwinkle — Deep Navy, lifted
  "#e76fe7", // Orchid — Deep Plum, lifted
  "#f296b7", // Rose — Dusty Rose
];

// Ring `i` of the wheel carries BASE * i swatches, which holds the arc length
// between neighbours constant — so every dot on the wheel is the same size
// regardless of how far out it sits.
export const WHEEL_RINGS = 5;
export const WHEEL_BASE_SEGMENTS = 6;

// Hue runs around the wheel and depth runs outward: saturation climbs and the
// target luminance falls, so the centre is a pale tint and the rim is as deep
// as the ink on top allows.
//
// The rim is a constant LUMINANCE rather than a constant lightness, which is
// what makes a ring read as one band: at a fixed lightness the yellows would
// glare and the blues would go muddy, and only some of them would still carry
// text. Every dot on a ring is equally legible instead.
const RIM_LUMINANCE = INK_FLOOR;
const CENTRE_LUMINANCE = 0.74;
// Saturation never drops to a tint, even at the centre. That serves the look
// — the old wheel was 90 near-white dots and picking from it was guesswork —
// and it is also what keeps the wheel clear of the card tones: those are muted,
// and a wheel with a washed-out middle ran straight through the pale violet
// that lilac occupies, in a band no amount of nudging could escape without
// visibly bending the hue sweep.
const MIN_SATURATION = 0.62;
const MAX_SATURATION = 0.98;

// Ways out of a collision, as [extra saturation, luminance to give up],
// ordered by how little they disturb the wheel.
//
// Saturation leads, which is not the obvious choice — the instinct is to make
// the swatch darker. But the two card tones a swatch can actually collide with
// are both comparatively muted (the third is darker than the ink floor allows,
// so nothing legal gets near it), and both sit in the violet-to-lime range
// where the wheel is at its palest. Stepping along luminance at a fixed hue
// crawls: a violet has to give up more depth than INK_FLOOR permits before it
// clears lilac. A punchier violet at the same depth is clear of it immediately.
// Hue is left alone throughout, so the sweep round the wheel stays in order.
const ESCAPES: [number, number][] = [
  [0.12, 0],
  [0.24, 0],
  [0.36, 0],
  [0.12, 0.06],
  [0.28, 0.06],
  [0.4, 0.06],
  [0.2, 0.12],
  [0.4, 0.12],
  [0.5, 0.18],
];

function avoidReserved(h: number, s: number, target: number): string {
  const direct = pitchToLuminance(h, s, target);
  if (!isReservedColor(direct)) return direct;

  for (const [satBoost, lumDrop] of ESCAPES) {
    const luminance = target - lumDrop;
    if (luminance < INK_FLOOR) continue;
    const candidate = pitchToLuminance(h, Math.min(1, s + satBoost), luminance);
    if (!isReservedColor(candidate)) return candidate;
  }
  return direct;
}

export function wheelSwatchHex(ring: number, index: number): string {
  // Ring 0 is the single neutral in the middle — the "no strong colour"
  // option, and the only swatch on the wheel with no hue to speak of.
  if (ring === 0) return pitchToLuminance(38, 0.22, 0.7);

  const t = ring / WHEEL_RINGS;
  const segments = WHEEL_BASE_SEGMENTS * ring;
  const hue = (index / segments) * 360;
  const saturation = MIN_SATURATION + (MAX_SATURATION - MIN_SATURATION) * t;
  const luminance = CENTRE_LUMINANCE + (RIM_LUMINANCE - CENTRE_LUMINANCE) * t;
  return avoidReserved(hue, saturation, luminance);
}

// Every swatch the wheel can produce. Used by the checks in the wheel's own
// tests and by anything that needs to know the full reachable set.
export function allWheelSwatches(): string[] {
  const out = [wheelSwatchHex(0, 0)];
  for (let ring = 1; ring <= WHEEL_RINGS; ring++) {
    for (let index = 0; index < WHEEL_BASE_SEGMENTS * ring; index++) {
      out.push(wheelSwatchHex(ring, index));
    }
  }
  return out;
}

export { contrastWithBlack };
