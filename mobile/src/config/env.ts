import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as {
  apiBaseUrl?: string;
  googleWebClientId?: string;
  googleIosClientId?: string;
};

// Points at `workers/` (Cloudflare Workers API).
//
// EXPO_PUBLIC_API_BASE_URL wins when set — Metro inlines it at bundle time, so
// pointing the app at a local `wrangler dev` is a shell variable rather than an
// edit to app.json. That matters because an edited app.json is easy to commit
// or ship by accident; an unset env var simply falls back to production.
//
//   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.12:8787 npx expo start --clear
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? extra.apiBaseUrl ?? "http://localhost:8787";

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
