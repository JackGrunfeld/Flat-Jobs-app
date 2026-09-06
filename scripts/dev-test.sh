#!/usr/bin/env bash
# One-command local test environment: local Worker API (wrangler dev) +
# Expo, with the app pointed at this machine's own LAN address rather than
# the production Worker — the manual dance documented in
# mobile/src/config/env.ts, scripted so it's one command instead of two
# terminals and a copy-pasted IP.
#
# `localhost` on a physical device means the device itself, not this
# machine, so a LAN IP is what a physical device actually needs — a
# simulator would be fine with localhost, but the LAN IP works for both.
set -euo pipefail

LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")

if [ -z "$LAN_IP" ]; then
  echo "Couldn't detect a LAN IP (no en0/en1) — falling back to localhost." >&2
  echo "A physical device won't be able to reach that; a simulator will." >&2
  LAN_IP="localhost"
fi

API_URL="http://$LAN_IP:8787"
echo "Local API will be reachable at $API_URL"

cd "$(dirname "$0")/.."

npx concurrently -k -n worker,mobile -c blue,magenta \
  "cd workers && npx wrangler dev --ip 0.0.0.0" \
  "cd mobile && EXPO_PUBLIC_API_BASE_URL=$API_URL npx expo start --dev-client --host lan"
