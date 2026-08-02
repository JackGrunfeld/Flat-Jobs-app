import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as { apiBaseUrl?: string };

// Points at `workers/` (Cloudflare Workers API). Override by editing
// app.json's expo.extra.apiBaseUrl once staging/production Workers exist.
export const API_BASE_URL = extra.apiBaseUrl ?? "http://localhost:8787";

// Registered in Google Cloud Console (Web client — used as the `webClientId`
// GoogleSignin needs even on native platforms to get a verifiable idToken).
export const GOOGLE_WEB_CLIENT_ID = "REPLACE_WITH_GOOGLE_WEB_CLIENT_ID";

// iOS OAuth 2.0 client ID from Google Cloud Console (type: iOS,
// bundle ID: com.flatjobs.app). Required on iOS when no GoogleService-Info.plist is present.
export const GOOGLE_IOS_CLIENT_ID = "404201488379-06qjpetsa0i8qsl7pqlogt50haqq7caq.apps.googleusercontent.com";
