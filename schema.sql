-- ProtoLab D1 schema. Applied by scripts/setup.sh (idempotent).

CREATE TABLE IF NOT EXISTS prototypes (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,            -- extracted from <title> at upload, editable in settings
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  files INTEGER NOT NULL DEFAULT 0,  -- maintained by the upload pipeline
  bytes INTEGER NOT NULL DEFAULT 0,  -- maintained by the upload pipeline
  password_hash TEXT,             -- NULL = open (default)
  password_salt TEXT,
  cookie_nonce TEXT               -- rotated on password set/change/remove
);

CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,             -- e.g. hostname from pairing
  token_hash TEXT NOT NULL,       -- SHA-256 (hex) of the bearer token
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT                 -- soft revoke; NULL = active
);

CREATE INDEX IF NOT EXISTS idx_tokens_hash ON tokens (token_hash) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS pairings (
  code TEXT PRIMARY KEY,          -- short, unambiguous; no 0/O/1/I
  requester TEXT NOT NULL,        -- hostname sent by the skill
  token_plain TEXT,               -- set on approval, deleted on claim/expiry
  token_id INTEGER,               -- minted token; revoked if never claimed
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,       -- pending: created_at + 5 min; approval resets it to a fresh 5-min claim window
  status TEXT NOT NULL            -- pending | approved | claimed | expired | denied
);
