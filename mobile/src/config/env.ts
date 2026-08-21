import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string;
  googleWebClientId?: string;
  googleIosClientId?: string;
};

// Points at `workers/` (Cloudflare Workers API).
//
// Resolution order — each level is a deliberate fallback, not an accident:
//
//   1. EXPO_PUBLIC_API_BASE_URL — inlined by Metro at serve time, so pointing
//      the app at a local `wrangler dev` is a shell variable rather than an
//      edit to app.json. That matters because an edited app.json is easy to
//      commit or ship by accident; an unset env var simply falls back.
//
//   2. extra.apiBaseUrl — the production Worker URL baked into app.json. This
//      is the dev default: an unset env var in a dev build still reaches a live
//      API (the production Worker), so sign-in and the rest work on a physical
//      device without any extra config. It just means you're testing against
//      the deployed backend, not your local `wrangler dev`.
//
//   3. "http://localhost:8787" — absolute last resort, only hit if app.json's
//      extra.apiBaseUrl is also missing (it shouldn't be).
//
// When running against a LOCAL wrangler dev server on a physical device, set
// the env var to your machine's LAN IP — `localhost` on the device is not your
// dev machine:
//
//   # Find your LAN IP first:
//   ifconfig | grep "inet " | grep -v 127.0.0.1   # → 192.168.1.12 (example)
//
//   # Start wrangler dev listening on all interfaces:
//   cd ../workers && npx wrangler dev --host 0.0.0.0
//
//   # Start Metro, telling the app to talk to the local server:
//   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.12:8787 npx expo start --dev-client --host lan
//
//   # Or, use Expo's tunnel relay (works from any network):
//   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.12:8787 npx expo start --dev-client --tunnel
//
//   # Simulator-only dev — no env var needed, falls back to production API:
//   npx expo start --dev-client
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL
  ?? extra.apiBaseUrl
  ?? "http://localhost:8787";

// In dev mode, warn loudly when the local dev server isn't being targeted, so
// it's never a mystery why sign-in fails against a localhost that isn't yours.
if (__DEV__ && !process.env.EXPO_PUBLIC_API_BASE_URL) {
  const target = extra.apiBaseUrl ?? "http://localhost:8787";
  console.warn(
    "[env] EXPO_PUBLIC_API_BASE_URL is not set — dev build is using " + target + ".\n" +
      "To test against a local `wrangler dev` server on a physical device, set:\n" +
      "  EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:8787\n" +
      "and start wrangler with `npx wrangler dev --host 0.0.0.0`.",
  );
}

// Both OAuth client IDs live in app.json's `extra` rather than here, so a
// build variant can change them without touching source.
//
// The WEB client is the one GoogleSignin wants as `webClientId` even on
// native: it's what makes the returned idToken addressed to our backend
// (`aud` = this value), which is what the Worker verifies against its
// GOOGLE_CLIENT_IDS list.
export const GOOGLE_WEB_CLIENT_ID = extra.googleWebClientId ?? "";

// iOS OAuth 2.0 client (type: iOS, bundle ID: com.flatjobs.app). Required on
// iOS when no GoogleService-Info.plist is present.
//
// NOTE: app.json's @react-native-google-signin plugin also carries this value,
// reversed, as `iosUrlScheme`. The two must stay in step — changing one
// without the other breaks the OAuth callback.
export const GOOGLE_IOS_CLIENT_ID = extra.googleIosClientId ?? "";

// Configured-ness is checked rather than assumed: an unset web client ID makes
// GoogleSignin fail at the point of tapping the button with an opaque native
// error, so the sign-in screen hides the Google option instead and this warns
// loudly in dev. See README's "Google Sign-In setup".
export const GOOGLE_SIGNIN_CONFIGURED = GOOGLE_WEB_CLIENT_ID.endsWith(".apps.googleusercontent.com");

if (__DEV__ && !GOOGLE_SIGNIN_CONFIGURED) {
  console.warn(
    "[env] expo.extra.googleWebClientId is not set in app.json — Google Sign-In is disabled. " +
      "Copy the Web client ID from Google Cloud Console > APIs & Services > Credentials.",
  );
}
