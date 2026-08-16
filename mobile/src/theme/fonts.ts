// DM Sans throughout — one family, differentiated by weight rather than by
// switching typeface. The role names are kept (rather than collapsing every
// call site onto one string) so weight can still be tuned per role in one
// place. Loaded once at the app root (App.tsx) so the typography is available
// everywhere, including for users who skip AuthScreen via a persisted session.
export const fonts = {
  regular: "DMSans_400Regular",
  bold: "DMSans_700Bold",
  // Headings and stats. DM Sans has no display cut, so presence comes from
  // the heaviest weight instead.
  display: "DMSans_900Black",
  subtitle: "DMSans_400Regular",
  subtitleBold: "DMSans_700Bold",
};
