# Flat Jobs API (Cloudflare Workers + D1)

Replaces the Firestore-direct-from-client data layer with a real backend. See
`../` root plan doc for the full migration context.

## Setup

```
npm install
```

Create the D1 database (one-time, requires a Cloudflare account):

```
npx wrangler d1 create flat-jobs-db
```

Copy the returned `database_id` into `wrangler.jsonc` (`d1_databases[0].database_id`,
currently `REPLACE_WITH_D1_DATABASE_ID`).

Local dev secrets: copy `.dev.vars.example` to `.dev.vars` and fill in `JWT_SECRET`
(any long random string for local dev). `.dev.vars` is gitignored — never commit it.

Deployed secrets (staging/production) are set via Wrangler, not `wrangler.jsonc`:

```
npx wrangler secret put JWT_SECRET
npx wrangler secret put RESEND_API_KEY      # optional, for invite emails
npx wrangler secret put RESEND_FROM_EMAIL   # optional, for invite emails
```

`GOOGLE_CLIENT_IDS` / `APPLE_CLIENT_IDS` (comma-separated allowed `aud` values)
are plain vars in `wrangler.jsonc` since they aren't secret — fill them in once
the Google Cloud / Apple Developer OAuth clients exist.

## Migrations

```
npm run db:migrate:local    # apply to the local Miniflare-backed D1
npm run db:migrate:remote   # apply to the real deployed D1
```

## Dev / Deploy

```
npm run dev       # wrangler dev, local D1 + local secrets from .dev.vars
npm run deploy    # wrangler deploy
```

## Verified so far

- `npx tsc --noEmit` passes clean.
- `npm run db:migrate:local` applies `migrations/0001_init.sql` successfully.
- A live `wrangler dev` smoke test round-tripped `GET /` and `POST /auth/signup`
  correctly (routing, JSON parsing, PBKDF2 hashing, D1 insert, and error
  handling all executed as expected) before this sandbox's local networking
  became unreliable for further live requests. Re-run `npm run dev` and hit
  the endpoints directly to continue verifying — the code itself checked out.
