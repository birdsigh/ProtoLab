// Per-slug password gates: PBKDF2-SHA-256 (100k iterations) password
// hashing, HMAC-signed cookies (plab_<slug>) carrying slug + expiry +
// cookie_nonce. Rotating the nonce invalidates outstanding cookies.

import type { Env } from "../types";
import { COOKIE_MAX_AGE_S, PBKDF2_ITERATIONS } from "../types";

export async function hashPassword(
  password: string,
  saltHex?: string,
): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export async function verifyPassword(
  password: string,
  storedHashHex: string,
  saltHex: string,
): Promise<boolean> {
  const { hash } = await hashPassword(password, saltHex);
  return timingSafeEqualHex(hash, storedHashHex);
}

/** Issue the Set-Cookie header value for a slug after a correct password. */
export async function issueCookie(env: Env, slug: string, nonce: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_S;
  const payload = `${slug}.${expires}`;
  const sig = await hmac(env.COOKIE_SECRET, `${payload}.${nonce}`);
  return (
    `plab_${slug}=${payload}.${sig}; Path=/${slug}; HttpOnly; Secure; ` +
    `SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_S}`
  );
}

/** Check the request's cookie for a slug against the current nonce. */
export async function verifyCookie(
  env: Env,
  request: Request,
  slug: string,
  nonce: string,
): Promise<boolean> {
  const cookie = getCookie(request, `plab_${slug}`);
  if (!cookie) return false;
  const [cslug, expStr, sig] = cookie.split(".");
  if (cslug !== slug || !expStr || !sig) return false;
  if (Number(expStr) < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(env.COOKIE_SECRET, `${cslug}.${expStr}.${nonce}`);
  return timingSafeEqualHex(sig, expected);
}

export function newNonce(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(8)));
}

// --- internals ---

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(sig));
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
