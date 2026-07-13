export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  PAIR_RATE_LIMIT: RateLimit;
  PAIR_POLL_RATE_LIMIT: RateLimit;
  COOKIE_SECRET: string;        // wrangler secret
  ACCESS_TEAM_DOMAIN: string;   // e.g. yourteam.cloudflareaccess.com
  ACCESS_AUD: string;           // Access application AUD tag
}

// Rate-limiting binding (open beta; not yet in workers-types)
export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

// --- Limits & defaults (SPEC.md "Defaults adopted") ---
export const MAX_ZIP_BYTES = 25 * 1024 * 1024;
export const MAX_ENTRIES = 500;
export const MAX_UNPACKED_BYTES = 100 * 1024 * 1024; // zip-bomb guard
export const COOKIE_MAX_AGE_S = 7 * 24 * 60 * 60;
export const PAIRING_TTL_MS = 5 * 60 * 1000;
export const PBKDF2_ITERATIONS = 100_000;
export const TOKEN_PREFIX = "plab_";

// CSRF guard for Zone 2 mutations: HTML forms cannot set custom headers,
// and cross-origin fetch fails the preflight. The settings UI sends this
// on every call.
export const CSRF_HEADER = "X-ProtoLab";
export const CSRF_VALUE = "1";

// --- Slugs ---
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;
export const RESERVED_SLUGS = new Set(["settings", "api", "favicon.ico", "robots.txt"]);

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug) && !slug.startsWith("_");
}

// --- Small helpers ---
export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export function notFound(msg = "not found"): Response {
  return json({ error: msg }, 404);
}
