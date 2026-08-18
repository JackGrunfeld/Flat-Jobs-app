# Shipping Flatr to TestFlight

Everything that can live in the repo is already done. What's left is the part
that needs your Apple and Expo accounts — it can't be scripted because it needs
an interactive login.

## What's already in place

| | |
|---|---|
| `expo-doctor` | 21/21 checks pass |
| Bundle ID | `com.flatjobs.app` |
| Apple Team ID | `P8KS9Q5PHU` (in `eas.json`) |
| Marketing version | `1.0.0` (`app.json` → `expo.version`) |
| Build number | managed by EAS — `appVersionSource: "remote"` + `autoIncrement` |
| Export compliance | pre-answered via `ios.config.usesNonExemptEncryption: false` |
| Icon | 1024×1024, no alpha channel |
| iPad | `supportsTablet: false` — the layouts are phone-only |
| Account deletion | Settings → Delete account (App Store guideline 5.1.1(v)) |
| Privacy policy | served by the API at `/privacy`, linked from Settings |

## Before the first build

**1. Deploy the API.** The app points at the production Worker, and the build
will ship expecting `/privacy` and `DELETE /auth/me` to exist.

```bash
cd workers && npx wrangler deploy
```

**2. Log in and link the EAS project.** This writes `expo.extra.eas.projectId`
into `app.json` — without it, push notification registration is skipped (see
`src/notifications/registerPushToken.ts`).

```bash
npm install -g eas-cli
eas login
eas init
git add app.json && git commit -m "Link EAS project"
```

**3. Create the App Store Connect record.** In App Store Connect → **Apps → +**:
platform iOS, name **Flatr**, bundle ID **com.flatjobs.app**, any SKU. Register
the bundle ID in the Apple Developer portal first if it isn't in the dropdown.

**4. Copy the app's Apple ID into `eas.json`.** It's on the app's
**General → App Information** page — a ~10-digit number. Add it as `ascAppId`:

```jsonc
"submit": {
  "production": {
    "ios": {
      "appleTeamId": "P8KS9Q5PHU",
      "bundleIdentifier": "com.flatjobs.app",
      "ascAppId": "0000000000"   // ← paste it here
    }
  }
}
```

**5. Create the APNs push key**, since the app uses `expo-notifications`:

```bash
eas credentials --platform ios
```

Production profile → **Push Notifications: Manage your Apple Push Notifications
Key** → let EAS create one. The distribution certificate and provisioning
profile are generated automatically on the first build, and the Sign in with
Apple capability is picked up from the entitlement.

## Build and submit

```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```

Then wait 10–15 minutes for Apple to finish processing before the build shows up
in TestFlight. Once you trust the setup, the two collapse into one command:

```bash
eas build --platform ios --profile production --auto-submit
```

## Testers

- **Internal testing** — up to 100 people on your team, no review, available as
  soon as processing finishes. Start here.
- **External testing** — up to 10,000 people, but needs **Beta App Review** plus
  Test Information: what to test, a contact email, the privacy policy URL
  (`https://flat-jobs-api.grunfeldjack.workers.dev/privacy`), and a **demo
  account** — the app is sign-in-gated, so reviewers need credentials.

## Still outstanding

- **`support@flatr.app` has to be a real, monitored mailbox.** It's the contact
  address in both the in-app Terms and the privacy policy, and it's where App
  Review and data-rights requests will arrive. Change it in
  `workers/src/routes/legal.ts` and `mobile/src/constants/terms.ts` if you'd
  rather use another address.
- **Neither the Terms nor the privacy policy has been reviewed by a lawyer.**
  Both are plain-language descriptions of what the app actually does. Get them
  looked at before a public App Store release — TestFlight is fine.
- **Privacy nutrition labels** still need filling in on App Store Connect. What
  the app collects, so you can answer them: email address, name, date of birth,
  country, user content (chores/lists/expenses/events), and a push token —
  all linked to identity, none used for tracking or advertising.
- **`git mv`'d `SplitwiseScreen` → `BillsScreen`** means the tab is now "Bills".
  Nothing to do, just don't be surprised by the name in screenshots.

## Notes for later builds

`mobile/ios/` is gitignored, so EAS never uploads it and runs `prebuild` on its
own servers instead. **Hand-edits inside `ios/` will not ship** — anything
native has to be expressed in `app.json` or a config plugin. EAS uploads your
working directory (respecting `.gitignore`), so uncommitted changes *do* go into
a build; commit first so you can tell what shipped.
