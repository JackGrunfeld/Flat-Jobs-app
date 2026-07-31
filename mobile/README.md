# Flat Jobs (Expo / React Native)

Replaces the CRA web app for the mobile port. Talks to `../workers/` (the
Cloudflare Workers API) instead of Firestore. See `../` root plan doc for the
full migration context.

## Setup

```
npm install
```

Before running:

1. **API URL** — `app.json`'s `expo.extra.apiBaseUrl` points at `http://localhost:8787`
   (local `wrangler dev`) by default. Change it to your staging/production
   Workers URL when testing against a deployed backend.
2. **Google Sign-In** — create OAuth client IDs in Google Cloud Console (Web,
   iOS, Android) and fill in `src/config/env.ts`'s `GOOGLE_WEB_CLIENT_ID`, then
   set the Workers backend's `GOOGLE_CLIENT_IDS` var to the comma-separated
   list of all three. `webClientId` is required even for native sign-in — it's
   what makes the returned `idToken` verifiable server-side.
3. **Apple Sign In** — register the Services ID / bundle ID in your Apple
   Developer account and set the Workers backend's `APPLE_CLIENT_IDS` var.
4. **`app.json`'s `ios.bundleIdentifier`/`android.package`** are placeholders
   (`com.flatjobs.app`) — change before any real build/store submission.

## Why a dev client, not Expo Go

Apple Sign In (`expo-apple-authentication`) and Android push notifications
(`expo-notifications`, SDK 53+) both require native modules Expo Go doesn't
ship. Use an EAS dev client:

```
npx eas build --profile development --platform ios      # or android
npx expo start --dev-client
```

## Verified so far

- `npx tsc --noEmit` passes clean.
- `npx expo-doctor` — 20/20 checks passed.
- Not yet run on a simulator/device or against a live Workers deployment —
  this sandbox has no iOS/Android runtime available. Build a dev client and
  run the golden path (signup → create/join flat → add chore → toggle
  completion → add shopping item → settle up → confirm the counterpart gets
  a push) per the plan's verification section before treating this as done.
