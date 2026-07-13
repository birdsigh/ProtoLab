# ProtoLab — Specification

## Summary

ProtoLab is a single Cloudflare Worker service that hosts throwaway HTML prototypes. Prototype content lives in R2, metadata in D1. The Worker serves the prototypes, a public gallery, and its own management page. Deploys are additive HTTP calls against an API — no local checkout of anything, no sync-down/copy-up. The repo holds only the service (Worker code, management UI, schema, setup scripts); prototype content never touches git.

Deploying ProtoLab (wrangler, from this repo) and deploying a prototype (one HTTP call, from anywhere) are separate verbs.

## Architecture

| Piece | Technology |
|---|---|
| Serving, routing, API, management UI | Cloudflare Worker |
| Prototype files | R2 bucket, keys `<slug>/<path>` |
| Metadata (prototypes, tokens, pairings) | D1 |
| Human auth for management | Cloudflare Access (self-hosted app over `/settings*`, which covers the management API at `/settings/api/*`) |
| Machine auth for deploys | Bearer tokens minted by ProtoLab itself |
| Prototype viewer auth (optional, per slug) | Password → signed cookie |
| Pairing rate limit | Workers rate-limiting binding |

A custom domain on a Cloudflare zone is **required** (Access cannot protect `*.workers.dev`). A **paid Workers plan is required**: unzipping deploys exceeds the free plan's CPU budget, and the rate-limiting binding needs it.

## Routing

- `GET /` — public gallery, rendered dynamically from D1. Password-protected slugs are hidden from it.
- `GET /<slug>/` and `GET /<slug>/<path>` — serve from R2. `/<slug>/` and any path ending in `/` rewrite to `index.html`. Content-Type comes from R2 `httpMetadata` set at upload. Unknown slug or path → 404.
- `GET /settings` — management UI. Behind Access.
- `/settings/api/*` — management API (Zone 2). Behind the same Access app as `/settings`, so `Cf-Access-Jwt-Assertion` is injected on every call and re-verified in the Worker.
- `/api/*` — machine API only: deploys (Zone 1) and pairing (Zone 3). Never covered by Access, so bearer-token deploys are never intercepted by a login redirect.

Slugs: lowercase alphanumeric plus hyphens, 1–63 chars, validated everywhere. Reserved: `settings`, `api`, `favicon.ico`, `robots.txt`, and any `_` prefix.

## D1 schema (sketch)

```sql
CREATE TABLE prototypes (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,            -- extracted from <title> at upload, editable in settings
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  files INTEGER NOT NULL,         -- maintained by the upload pipeline
  bytes INTEGER NOT NULL,         -- maintained by the upload pipeline
  password_hash TEXT,             -- NULL = open (default)
  password_salt TEXT,
  cookie_nonce TEXT               -- rotated on password set/change/remove; invalidates cookies
);

CREATE TABLE tokens (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,             -- e.g. hostname from pairing
  token_hash TEXT NOT NULL,       -- SHA-256 of the bearer token
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT                 -- soft revoke; NULL = active
);

CREATE TABLE pairings (
  code TEXT PRIMARY KEY,          -- short, unambiguous, e.g. 6 chars no 0/O/1/I
  requester TEXT NOT NULL,        -- hostname sent by the skill
  token_plain TEXT,               -- set on approval, deleted on claim/expiry
  token_id INTEGER,               -- minted token; revoked if never claimed
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,       -- pending: created_at + 5 min; approval resets to a fresh 5-min claim window
  status TEXT NOT NULL            -- pending | approved | claimed | expired | denied
);
```

File counts and sizes are written to D1 by the upload pipeline (which knows them exactly, and is the only mutation path), never computed from R2 listings — no N+1 listing for the gallery or settings table.

## API

Three auth zones, checked in the Worker itself — never assume the edge config is right.

### Zone 1 — deploy API (bearer token)

`Authorization: Bearer <token>`. Look up the token's SHA-256 against active rows in `tokens`; update `last_used_at` on success.

- `PUT /api/prototypes/<slug>` — body is a zip of the prototype folder (`Content-Type: application/zip`). Convenience path: `Content-Type: text/html` accepts a raw single file as `index.html`. Replace semantics: unpack (fflate), validate, write all new objects, then delete any existing `<slug>/` keys not in the new set. Upsert the D1 row (title from `<title>` of `index.html`, fall back to slug; files/bytes from the unpacked set). Returns `{ url, slug, files, bytes }`.
- `DELETE /api/prototypes/<slug>` — delete R2 prefix + D1 row.
- `GET /api/health` — validates the token, returns `{ ok, lab_name, base_url }`. Used by the skill to verify config.

Upload guardrails: reject zips over 25 MB (tunable), entries over 500, absolute paths or `..` traversal in entry names, and entries that decompress past a total-size cap. The size and count checks run against the zip's declared sizes **before** anything is inflated (zip-bomb guard — a small zip must not be able to exhaust Worker memory during decompression). Static content only; no execution.

### Zone 2 — management API (Access JWT), under `/settings/api/*`

Same-origin calls from the settings UI. Because these paths sit inside the Access app's `/settings*` coverage, Access injects `Cf-Access-Jwt-Assertion`; the Worker still verifies it against the team's public JWKS (issuer + audience checked, keys cached) on every request. A missing/invalid JWT is a 403 even if Access is misconfigured upstream.

All non-GET requests must additionally carry `X-ProtoLab: 1` (CSRF guard). Access injects a valid JWT for any request bearing the admin's `CF_Authorization` cookie — including cross-site form POSTs — so the JWT alone does not prove the request came from the settings UI. HTML forms cannot set custom headers and cross-origin fetch fails the preflight, so the header does.

- `GET /settings/api/prototypes` — list with title, dates, protection status, size/file count (from D1).
- `POST /settings/api/prototypes/<slug>` — web upload (zip via form). Same pipeline as Zone 1.
- `DELETE /settings/api/prototypes/<slug>`
- `PUT /settings/api/prototypes/<slug>/title` — body `{ title }`.
- `PUT /settings/api/prototypes/<slug>/password` — set password (salted PBKDF2 hash; see Prototype passwords).
- `DELETE /settings/api/prototypes/<slug>/password` — back to open.
- `GET /settings/api/tokens`, `POST /settings/api/tokens` (manual mint, named), `DELETE /settings/api/tokens/<id>` (revoke), `PUT /settings/api/tokens/<id>/name` (rename, body `{ name }`).
- `GET /settings/api/pairings` (pending), `POST /settings/api/pairings/<code>/approve`, `POST /settings/api/pairings/<code>/deny`.

### Zone 3 — pairing (unauthenticated, rate-limited)

- `POST /api/pair` — body `{ requester: "<hostname>" }`. Returns `{ code, expires_at }`. Rate-limited via the Workers rate-limiting binding, 5/min/IP.
- `GET /api/pair/<code>` — poll. `pending` → 202; `approved` → 200 with `{ token }` exactly once (then `token_plain` is deleted and status becomes `claimed`); expired/denied → 410. Also rate-limited (60/min/IP — legit pollers do ~30/min; this blocks code brute-forcing).

On approval the server mints the token, inserts the `tokens` row named after the requester hostname, and stashes the plaintext in the pairing row, opening a fresh 5-minute claim window (`expires_at` is reset). If the claim never happens, the plaintext is cleared and the undelivered token revoked — lazily on the next poll of that code, or by the sweep that runs with `GET /settings/api/pairings` (the pairing row records `token_id` for this). Plaintext therefore never outlives its window.

## Prototype passwords

Open by default. When a password is set:

1. Request to `/<slug>/*` without a valid cookie → Worker serves a minimal password form (no prototype content leaks, including on asset paths).
2. Correct password → `Set-Cookie: plab_<slug>=<HMAC-signed value>; Path=/<slug>; HttpOnly; Secure; SameSite=Lax; Max-Age=604800` (7 days, tunable). Signed with a Worker secret (`COOKIE_SECRET`); payload includes slug + expiry + the current `cookie_nonce`.
3. Setting, changing, or removing the password rotates `cookie_nonce`, invalidating outstanding cookies.

Password hashing is PBKDF2-SHA-256, 100,000 iterations, via WebCrypto (Workers has no scrypt). These are low-stakes prototype gates, not user accounts. Never accept the password via query string. Protected slugs are omitted from the public gallery.

## Settings page (`/settings`)

Single page served by the Worker (static asset or inline; no build step preferred). Sections:

- **Prototypes** — table: title, slug, live URL, updated, size/files, open/protected. Actions: delete (confirm), edit title, set/remove password, upload new version.
- **Upload** — form: slug + zip (or folder via `webkitdirectory`, zipped client-side). Same validation as the API.
- **Tokens** — table: name, created, last used, active/revoked. Actions: mint named token (plaintext shown once), revoke.
- **Pairing requests** — pending codes with requester hostname and countdown; approve / deny. Approve by matching the code the skill printed, not the hostname (hostnames are self-reported).

No rename feature. Renames are out of scope permanently (R2 has no rename; stable URLs are the product).

## Deploy skill contract (`deploy-prototype`, ships separately as a client skill — [here](https://github.com/birdsigh/skills))

The skill is a thin client over Zone 1. No repo clone, no wrangler, no Cloudflare auth.

### Config

`~/.config/protolab/config` (TOML, chmod 600), multi-lab:

```toml
default = "personal"

[labs.personal]
url = "https://lab.example.com"
token = "plab_..."

[labs.work]
url = "https://proto.acme.dev"
token = "plab_..."
```

Resolution order per invocation:

1. `PROTOLAB_URL` + `PROTOLAB_TOKEN` env vars (explicit override, wins outright)
2. `PROTOLAB_LAB=<name>` env var selecting a config entry
3. Lab named in the user's request ("deploy this to the work lab")
4. `default` from config
5. Exactly one lab configured → use it
6. Otherwise: ask, never guess

Also check `./.protolab` in the working directory before giving up (for sandboxed sessions where `$HOME` doesn't persist but the project mount does; must be gitignored).

### First run (pairing)

1. Ask for the lab URL only.
2. `POST /api/pair` with the machine hostname; print "open <url>/settings and approve code XXXX".
3. Poll `GET /api/pair/<code>` until approved; write config entry.
4. Ask for a local alias (suggest domain short name). First lab paired becomes default.
5. Dedupe by URL — re-pairing an existing URL updates that entry, never duplicates.

### Behavior

- Deploy: zip the folder (or wrap the single file), `PUT /api/prototypes/<slug>`, echo the **full URL** returned (slugs are per-lab namespaces; never report just the slug).
- 401 → "token for '<alias>' was revoked — re-pair?" rather than a raw error.
- Verbs: deploy, remove (calls DELETE), list labs, add lab (pair), remove lab (local config edit only — token revocation happens on that lab's settings page), set default.
- Static HTML only. Backend, auth, database, or build steps → wrong tool; say so and stop.

## Repo layout

```
protolab/
├── src/                  # Worker: router, R2/D1 access, auth, zip pipeline
│   ├── index.ts
│   ├── types.ts          # Env bindings, shared constants
│   ├── auth/             # access-jwt.ts, tokens.ts, password-cookie.ts
│   ├── api/              # deploy.ts, manage.ts, pair.ts
│   ├── zip.ts            # unpack + validation pipeline
│   ├── serve.ts          # slug content + gallery
│   └── settings/         # settings page UI
├── schema.sql            # D1 migrations
├── scripts/
│   └── setup.sh          # guided, idempotent; --check mode
├── wrangler.toml.example # R2 + D1 + rate-limit bindings, routes template;
│                         # setup.sh copies it to gitignored wrangler.toml
├── SPEC.md               # this document
├── AGENTS.md             # deploy contract (thin: config resolution + API)
└── README.md
```

Secrets (`COOKIE_SECRET`) via `wrangler secret put`, never in the repo. `wrangler.toml` is gitignored since it accumulates deployment-specific values (database id, domain, Access AUD); the committed `wrangler.toml.example` is the template. Repo can stay public.

## Setup story

`setup.sh` automates everything wrangler can reach, then prints a checklist for the dashboard-only steps:

**Scripted:** create R2 bucket, create D1 database, apply `schema.sql`, generate + set `COOKIE_SECRET`, `wrangler deploy`.

**Checklist (one-time, human):** Cloudflare account on the **Workers paid plan** + `wrangler login` or API token; Zero Trust onboarding (team name) if never used; Access self-hosted app covering `/settings*` (policy: your identity); attach the custom domain to the Worker; set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` vars.

`setup.sh --check` verifies the manual steps actually took: `/settings` and `/settings/api/prototypes` redirect to Access login when unauthenticated (and never return data), `/api/health` returns 401 without a token, `/` serves the gallery. Setup is not "done" until `--check` passes — this is the guard against a silently open management API.

## Security notes

- Every auth check lives in the Worker; edge config (Access app coverage) is defense in depth, not the mechanism.
- Token plaintext exists only: once on screen at manual mint, and in a pairing row for ≤5 minutes (the claim window; lapsed windows clear the plaintext and revoke the undelivered token). D1 stores hashes.
- Zone 2 mutations require the `X-ProtoLab: 1` header on top of the Access JWT — the JWT alone does not stop cross-site form POSTs riding the admin's Access cookie.
- Constant-time comparisons for passwords; tokens are matched by SHA-256 lookup.
- Zip pipeline validates paths, counts, and decompressed size before any write.
- Pairing endpoints are the only unauthenticated write surface: short codes, 5-minute TTL, single-use claim, rate-limit binding, and approval always happens behind Access.
- **Accepted risk (v1):** prototypes share an origin with the management UI. A hostile prototype viewed by a logged-in admin can call `/settings/api/*` same-origin with the admin's Access cookie. Deployers are trusted token holders, so the realistic vector is a prototype pulling a compromised third-party script. The upgrade path, if the lab is ever shared more widely, is origin separation (content on its own subdomain).

## Non-goals

Rename/redirects. Prototype version history. Server-side rendering, backends, or build steps for prototypes. Multi-user roles (Access policy decides who's an admin; everyone past Access is equal). Public gallery listing of protected slugs.

## Defaults adopted

- Upload cap 25 MB, 500 entries; password cookie 7 days; pairing TTL and claim window 5 minutes; pairing rate limits 5/min/IP (create) and 60/min/IP (poll).
- PBKDF2-SHA-256, 100,000 iterations, for prototype passwords.
- Titles extracted from `<title>` at upload, editable in settings.
- Token format `plab_` + 32 random bytes base64url, for grep-ability and secret-scanner friendliness.
