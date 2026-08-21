# Flat Jobs (Expo / React Native)

Replaces the CRA web app for the mobile port. Talks to `../workers/` (the
Cloudflare Workers API) instead of Firestore. See `../` root plan doc for the
full migration context.

## Setup

```
npm install
```

Before running:

1. **API URL** — `app.json`'s `expo.extra.apiBaseUrl` points at the production
   Worker (`https://flat-jobs-api.grunfeldjack.workers.dev`). In dev builds,
   `src/config/env.ts` falls back to that same production URL when
   `EXPO_PUBLIC_API_BASE_URL` is unset, so sign-in works out of the box on a
   physical device. To test against a **local** `wrangler dev` server instead,
   set the env var to your machine's LAN IP (see "Running the dev client on a
   physical device" below).
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
```

## Running the dev client on a physical device

A development client has **no bundled JS** — it downloads the JavaScript bundle
from the Metro bundler at runtime. This is different from production/TestFlight
builds, which bake the JS in at EAS build time.

### The two things that can go wrong

**1. Metro bundler not reachable.** `npx expo start` defaults to `localhost:8081`.
On a physical device, `localhost` is the device itself, not your Mac. The app
will hang on the splash screen forever. Fix: use `--host lan` or `--tunnel`:

```bash
# Same Wi-Fi network as your machine
npx expo start --dev-client --host lan

# Or, relay through Expo's tunnel (works from any network)
npx expo start --dev-client --tunnel
```

**2. Local API server not reachable.** If you're running `wrangler dev` locally,
the app needs your machine's LAN IP, not `localhost` (same reason as above).
`wrangler dev` also binds to `localhost` by default — you need `--host 0.0.0.0`
so it listens on all interfaces:

```bash
# Find your LAN IP first:
ifconfig | grep "inet " | grep -v 127.0.0.1
# → 192.168.1.12  (example)

# Start wrangler dev listening on all interfaces:
cd ../workers && npx wrangler dev --host 0.0.0.0

# Start Metro, telling the app to talk to the local server:
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.12:8787 npx expo start --dev-client --host lan
```

> **No env var?** Without `EXPO_PUBLIC_API_BASE_URL`, the dev build silently
> falls back to the **production** Worker URL — sign-in will work, but you'll
> be hitting the live backend, not your local `wrangler dev`. A dev-mode
> warning is printed in the Metro console to make this visible.

For **simulator-only** development, you don't need the env var or `--host`:

```bash
npx expo start --dev-client
```

## Verified so far

- `npx tsc --noEmit` passes clean.
- `npx expo-doctor` — 20/20 checks pass.
- Not yet run on a simulator/device or against a live Workers deployment —
  this sandbox has no iOS/Android runtime available. Build a dev client and
  run the golden path (signup → create/join flat → add chore → toggle
  completion → add shopping item → settle up → confirm the counterpart gets
  a push) per the plan's verification section before treating this as done.
