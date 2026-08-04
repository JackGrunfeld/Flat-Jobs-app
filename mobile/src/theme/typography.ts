// Font-size scale built by stepping a base size up/down by the golden ratio
// (φ ≈ 1.618), so every heading level differs from its neighbor by the same
// proportion rather than ad-hoc pixel values. Used across the sign-in screen
// and the app's menus for consistent heading/body/caption sizing.
export const GOLDEN_RATIO = 1.618;

const BASE = 14;

export const typeScale = {
  caption: Math.round(BASE / GOLDEN_RATIO), // ~9 — micro/uppercase labels, badges, chips
  body: BASE, // 14 — section headers, body copy, buttons, inputs
  subheading: Math.round(BASE * GOLDEN_RATIO), // ~23 — page/screen titles
  heading: Math.round(BASE * GOLDEN_RATIO ** 2), // ~37 — reserved for standout in-page emphasis
  display: Math.round(BASE * GOLDEN_RATIO ** 3), // ~59 — hero/brand title (sign-in screen)
};
