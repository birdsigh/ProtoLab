// Zone 2 auth: verify the Cf-Access-Jwt-Assertion header against the
// Access team's public JWKS. Issuer + audience checked; keys cached.
// A missing/invalid JWT is a 403 even if Access is misconfigured upstream.

import type { Env } from "../types";
import { json } from "../types";

interface Jwk {
  kid: string;
  kty: string;
  alg: string;
  n: string;
  e: string;
}

let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getJwks(env: Env): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(`https://${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  jwksCache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

/**
 * Returns null when the request carries a valid Access JWT; otherwise a
 * 403 Response to return as-is.
 */
export async function requireAccessJwt(request: Request, env: Env): Promise<Response | null> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return json({ error: "missing Access JWT" }, 403);

  try {
    const valid = await verifyJwt(token, env);
    if (!valid) return json({ error: "invalid Access JWT" }, 403);
    return null;
  } catch {
    return json({ error: "Access JWT verification failed" }, 403);
  }
}

const CLOCK_LEEWAY_S = 30;

let lastForcedRefresh = 0;
const FORCED_REFRESH_MIN_MS = 60_000;

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64urlToBytes(segment)));
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

interface JwtPayload {
  exp?: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
}

async function verifyJwt(token: string, env: Env): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = decodeSegment(headerB64) as JwtHeader;
  if (header.alg !== "RS256" || typeof header.kid !== "string") return false;

  // Find the signing key; on unknown kid, bust the cache and refetch
  // (Access rotates keys, and our cache may be stale). Throttled so a
  // stream of junk-kid JWTs cannot force a JWKS fetch per request.
  let jwk = (await getJwks(env)).find((k) => k.kid === header.kid);
  if (!jwk) {
    if (Date.now() - lastForcedRefresh < FORCED_REFRESH_MIN_MS) return false;
    lastForcedRefresh = Date.now();
    jwksCache = null;
    jwk = (await getJwks(env)).find((k) => k.kid === header.kid);
    if (!jwk) return false;
  }
  if (jwk.kty !== "RSA") return false;

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256" },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signature = base64urlToBytes(signatureB64);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature as BufferSource,
    data,
  );
  if (!valid) return false;

  // Signature is good; now the claims.
  const payload = decodeSegment(payloadB64) as JwtPayload;
  const nowS = Math.floor(Date.now() / 1000);

  if (typeof payload.exp !== "number" || nowS > payload.exp + CLOCK_LEEWAY_S) return false;
  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== "number" || nowS < payload.nbf - CLOCK_LEEWAY_S) return false;
  }

  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return false;

  const aud = payload.aud;
  const audOk = Array.isArray(aud)
    ? aud.includes(env.ACCESS_AUD)
    : aud === env.ACCESS_AUD;
  if (!audOk) return false;

  return true;
}
