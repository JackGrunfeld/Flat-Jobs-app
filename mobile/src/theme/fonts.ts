// The SpaceMono/RussoOne pairing established on the sign-in screen — the
// app's typographic identity. Loaded once at the app root (App.tsx) so it's
// available everywhere, including for users who skip AuthScreen via a
// persisted session.
export const fonts = {
  regular: "SpaceMono_400Regular",
  bold: "SpaceMono_700Bold",
  display: "RussoOne_400Regular",
  // Trial alternate for the sign-in subtitle — a Dotum-like clean geometric
  // sans (Dotum/Dotumche itself is a proprietary Windows font, not available
  // on Google Fonts).
  subtitle: "NotoSansKR_400Regular",
  subtitleBold: "NotoSansKR_700Bold",
};
