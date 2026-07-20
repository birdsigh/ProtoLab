// Zone 1 auth: bearer tokens minted by ProtoLab. D1 stores SHA-256 hex
// hashes only; plaintext exists once on screen at mint, and briefly in a
// pairing row.

import type { Env } from "../types";
import { TOKEN_PREFIX } from "../types";

interface TokenIdRow {
  id: number;
}

/** Mint a new token. Returns plaintext (show once) — caller stores the hash. */
export async function mintToken(env: Env, name: string): Promise<{ plaintext: string; id: number }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const plaintext = TOKEN_PREFIX + base64url(bytes);
  const hash = await sha256Hex(plaintext);
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    "INSERT INTO tokens (name, token_hash, created_at) VALUES (?, ?, ?) RETURNING id",
  )
    .bind(name, hash, now)
    .first<{ id: number }>();
  if (!res) throw new Error("token insert failed");
  return { plaintext, id: res.id };
}

/**
 * Validate an Authorization: Bearer header. Returns an ID-only token row when
 * valid (and bumps last_used_at), null otherwise.
 */
export async function verifyBearer(request: Request, env: Env): Promise<TokenIdRow | null> {
  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const hash = await sha256Hex(auth.slice(7).trim());
  const row = await env.DB.prepare(
    "SELECT id FROM tokens WHERE token_hash = ? AND revoked_at IS NULL",
  )
    .bind(hash)
    .first<TokenIdRow>();
  if (!row) return null;
  await env.DB.prepare("UPDATE tokens SET last_used_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), row.id)
    .run();
  return row;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
