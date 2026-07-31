-- Users. OAuth-only users have NULL password columns.
CREATE TABLE users (
  id                   TEXT PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE,
  display_name         TEXT NOT NULL,
  password_hash        TEXT,
  password_salt        TEXT,
  password_iterations  INTEGER,
  created_at           INTEGER NOT NULL
);

-- Links a Google/Apple identity to a user. A user may have both, plus a password.
CREATE TABLE auth_identities (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_sub  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  UNIQUE (provider, provider_sub)
);
CREATE INDEX idx_auth_identities_user_id ON auth_identities(user_id);

CREATE TABLE flats (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  code       TEXT NOT NULL UNIQUE,
  owner_id   TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

-- Replaces flats.memberIds[]/memberNames{}/memberColors{}. Display name is always
-- sourced live via JOIN users, so no name ever needs backfilling here.
CREATE TABLE flat_members (
  flat_id   TEXT NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  color     TEXT,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (flat_id, user_id),
  UNIQUE (user_id) -- one flat per user, enforced at the DB level
);

-- Replaces flats.invitedEmails[]. Globally unique: an email can only have one
-- pending invite at a time, removing the old "which flat did this invite belong
-- to" ambiguity.
CREATE TABLE flat_invites (
  id         TEXT PRIMARY KEY,
  flat_id    TEXT NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  email      TEXT NOT NULL UNIQUE,
  invited_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_flat_invites_flat_id ON flat_invites(flat_id);

CREATE TABLE chores (
  id          TEXT PRIMARY KEY,
  flat_id     TEXT NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  frequency   TEXT NOT NULL CHECK (frequency IN ('Daily', 'Weekly', 'Monthly')),
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_chores_flat_id ON chores(flat_id);

-- Replaces chore.memberIds[]. An empty set means "whole flat rotation pool".
CREATE TABLE chore_members (
  chore_id TEXT NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (chore_id, user_id)
);

-- Replaces flats/{id}/history/{week_task} (keyed by chore NAME). Keyed here by
-- chore_id so renaming a chore no longer orphans its history.
CREATE TABLE chore_completions (
  chore_id          TEXT NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  week              INTEGER NOT NULL,
  assigned_user_id  TEXT NOT NULL REFERENCES users(id),
  done              INTEGER NOT NULL DEFAULT 0,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (chore_id, week)
);
CREATE INDEX idx_chore_completions_assigned_user ON chore_completions(assigned_user_id);

CREATE TABLE shopping_items (
  id                TEXT PRIMARY KEY,
  flat_id           TEXT NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  cost_cents        INTEGER NOT NULL,
  added_by_user_id  TEXT NOT NULL REFERENCES users(id),
  created_at        INTEGER NOT NULL
);
CREATE INDEX idx_shopping_items_flat_id ON shopping_items(flat_id);

-- Replaces shopping_items.splitWith[] (previously names, now user_id FKs).
CREATE TABLE shopping_item_splits (
  item_id TEXT NOT NULL REFERENCES shopping_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, user_id)
);

-- New feature: a persisted "X paid Y $Z" ledger entry. Nets against
-- shopping_item_splits balances so settled debts stop showing as owed.
CREATE TABLE settlements (
  id            TEXT PRIMARY KEY,
  flat_id       TEXT NOT NULL REFERENCES flats(id) ON DELETE CASCADE,
  from_user_id  TEXT NOT NULL REFERENCES users(id),
  to_user_id    TEXT NOT NULL REFERENCES users(id),
  amount_cents  INTEGER NOT NULL,
  note          TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_settlements_flat_id ON settlements(flat_id);
CREATE INDEX idx_settlements_from_user ON settlements(from_user_id);
CREATE INDEX idx_settlements_to_user ON settlements(to_user_id);

-- New feature: Expo push tokens, one row per device.
CREATE TABLE push_tokens (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL,
  platform   TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, token)
);

-- Opaque refresh tokens (only the hash is stored). Access tokens are short-lived
-- JWTs verified statelessly; refresh tokens are the revocable part of a session.
CREATE TABLE refresh_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
