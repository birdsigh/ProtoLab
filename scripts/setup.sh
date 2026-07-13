#!/usr/bin/env bash
# ProtoLab setup — guided, idempotent. Run from the repo root.
#
#   scripts/setup.sh          create resources, apply schema, deploy
#   scripts/setup.sh --check  verify the manual (dashboard) steps took
#
# Requires: wrangler (logged in), a Cloudflare account on the Workers
# PAID plan (zip unpacking exceeds free-plan CPU; the rate-limiting
# binding needs paid too), and a custom domain on a Cloudflare zone.

set -euo pipefail

BUCKET_NAME="protolab"
DB_NAME="protolab"

say()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ok\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mFAIL\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------- --check
if [[ "${1:-}" == "--check" ]]; then
  BASE_URL="${2:-}"
  if [[ -z "$BASE_URL" ]]; then
    read -rp "Lab base URL (e.g. https://lab.example.com): " BASE_URL
  fi
  BASE_URL="${BASE_URL%/}"
  failures=0

  # curl must not kill the script under set -e (e.g. DNS/TLS still
  # provisioning on a fresh custom domain) — map transport errors to 000.
  probe() { local c; c=$(curl -s -o /dev/null -w '%{http_code}' "$1") || c="000"; echo "$c"; }

  say "checking $BASE_URL"

  # /settings must redirect to Access login when unauthenticated
  code=$(probe "$BASE_URL/settings")
  if [[ "$code" == "302" ]]; then ok "/settings redirects to Access login"; else
    fail "/settings returned $code (expected 302 to Access) — management UI may be OPEN"; failures=$((failures+1)); fi

  # management API must never return data unauthenticated
  body_code=$(probe "$BASE_URL/settings/api/prototypes")
  if [[ "$body_code" == "302" || "$body_code" == "403" ]]; then
    ok "/settings/api/prototypes denied ($body_code)"
  else
    fail "/settings/api/prototypes returned $body_code — management API may be OPEN"; failures=$((failures+1)); fi

  # deploy API requires a token
  code=$(probe "$BASE_URL/api/health")
  if [[ "$code" == "401" ]]; then ok "/api/health returns 401 without a token"; else
    fail "/api/health returned $code (expected 401)"; failures=$((failures+1)); fi

  # gallery is public
  code=$(probe "$BASE_URL/")
  if [[ "$code" == "200" ]]; then ok "/ serves the gallery"; else
    fail "/ returned $code (expected 200)"; failures=$((failures+1)); fi

  if [[ "$code" == "000" ]]; then
    echo "  (000 = could not connect at all — a freshly attached custom domain"
    echo "   can take a minute or two to provision DNS + TLS; retry shortly)"
  fi

  if (( failures > 0 )); then
    fail "$failures check(s) failed — setup is NOT done"
    exit 1
  fi
  ok "all checks passed"
  exit 0
fi

# ---------------------------------------------------------------- scripted
# Use the repo-local wrangler via npx so this works whether invoked as
# `npm run setup` or `scripts/setup.sh` directly.
[ -d node_modules ] || { fail "node_modules missing — run: npm install"; exit 1; }
npx --no-install wrangler --version >/dev/null 2>&1 || { fail "wrangler not installed — run: npm install"; exit 1; }
wrangler() { npx --no-install wrangler "$@"; }

# wrangler.toml is gitignored (it accumulates deployment-specific values:
# database id, domain, Access AUD); bootstrap it from the template.
if [[ ! -f wrangler.toml ]]; then
  cp wrangler.toml.example wrangler.toml
  ok "created wrangler.toml from wrangler.toml.example"
fi

say "R2 bucket '$BUCKET_NAME'"
if wrangler r2 bucket list 2>/dev/null | grep -q "$BUCKET_NAME"; then
  ok "exists"
else
  wrangler r2 bucket create "$BUCKET_NAME"
fi

say "D1 database '$DB_NAME'"
if wrangler d1 list 2>/dev/null | grep -q "$DB_NAME"; then
  ok "exists"
else
  wrangler d1 create "$DB_NAME"
  echo
  echo "  !! Copy the database_id printed above into wrangler.toml, then re-run."
  exit 1
fi

if grep -q "REPLACED_BY_SETUP_SH" wrangler.toml; then
  fail "wrangler.toml still has database_id = REPLACED_BY_SETUP_SH — paste the real id"
  exit 1
fi

say "applying schema.sql (idempotent)"
wrangler d1 execute "$DB_NAME" --remote --file=schema.sql

say "COOKIE_SECRET"
if wrangler secret list 2>/dev/null | grep -q "COOKIE_SECRET"; then
  ok "already set"
else
  openssl rand -base64 32 | wrangler secret put COOKIE_SECRET
fi

say "deploying Worker"
wrangler deploy

cat <<'CHECKLIST'

-------------------------------------------------------------------
One-time manual steps (Cloudflare dashboard):

 1. Workers PAID plan enabled on the account.
 2. Zero Trust onboarding done (pick a team name) if never used.
 3. Access self-hosted application covering:  <your-domain>/settings*
    Policy: allow your identity only.
 4. Attach your custom domain to the Worker (Workers → protolab →
    Settings → Domains & Routes), and set it in wrangler.toml routes.
 5. Set ACCESS_TEAM_DOMAIN and ACCESS_AUD in wrangler.toml [vars]
    (AUD is on the Access app's overview page), then redeploy.

Then verify:   scripts/setup.sh --check https://<your-domain>

Setup is NOT done until --check passes.
-------------------------------------------------------------------
CHECKLIST
