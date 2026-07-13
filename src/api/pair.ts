// Zone 3 — pairing (unauthenticated, rate-limited via PAIR_RATE_LIMIT).
//   POST /api/pair          { requester } -> { code, expires_at }
//   GET  /api/pair/<code>   202 pending | 200 { token } once | 410 gone

import type { Env } from "../types";
import { json, notFound, PAIRING_TTL_MS } from "../types";

// No 0/O/1/I — codes are read over the shoulder.
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const MAX_REQUESTER_LEN = 128;

export async function handlePair(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/pair" && request.method === "POST") {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.PAIR_RATE_LIMIT.limit({ key: ip });
    if (!success) return json({ error: "rate limited" }, 429);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid JSON body" }, 400);
    }
    const raw = (body as { requester?: unknown } | null)?.requester;
    if (typeof raw !== "string" || raw.trim() === "") {
      return json({ error: "requester must be a non-empty string" }, 400);
    }
    const requester = raw.trim().slice(0, MAX_REQUESTER_LEN);

    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const expiresAt = new Date(now + PAIRING_TTL_MS).toISOString();

    const insert = (code: string) =>
      env.DB.prepare(
        "INSERT INTO pairings (code, requester, token_plain, created_at, expires_at, status) " +
          "VALUES (?, ?, NULL, ?, ?, 'pending')",
      )
        .bind(code, requester, createdAt, expiresAt)
        .run();

    let code = newCode();
    try {
      await insert(code);
    } catch {
      // Astronomically unlikely PK collision — retry once with a fresh code.
      code = newCode();
      await insert(code);
    }

    return json({ code, expires_at: expiresAt });
  }

  const m = url.pathname.match(/^\/api\/pair\/([A-Z2-9]+)$/i);
  if (m && request.method === "GET") {
    // Rate-limit polls too: legit clients poll ~30/min; anything faster
    // is brute-forcing codes (each guess would otherwise be a free D1 hit
    // and a shot at stealing an approved token).
    const pollIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const poll = await env.PAIR_POLL_RATE_LIMIT.limit({ key: pollIp });
    if (!poll.success) return json({ error: "rate limited" }, 429);

    // The route regex is case-insensitive but codes are stored uppercase.
    const code = m[1]!.toUpperCase();

    const row = await env.DB.prepare(
      "SELECT status, expires_at FROM pairings WHERE code = ?",
    )
      .bind(code)
      .first<{ status: string; expires_at: string }>();

    if (!row) return notFound("unknown code");

    if (row.status === "pending") {
      if (Date.parse(row.expires_at) <= Date.now()) {
        await env.DB.prepare(
          "UPDATE pairings SET status = 'expired' WHERE code = ? AND status = 'pending'",
        )
          .bind(code)
          .run();
        return json({ error: "expired" }, 410);
      }
      return json({ status: "pending" }, 202);
    }

    if (row.status === "approved") {
      // Claim window lapsed: clear the plaintext and revoke the token
      // that was minted but never delivered.
      if (Date.parse(row.expires_at) <= Date.now()) {
        const expired = await env.DB.prepare(
          "UPDATE pairings SET token_plain = NULL, status = 'expired' " +
            "WHERE code = ? AND status = 'approved' RETURNING token_id",
        )
          .bind(code)
          .first<{ token_id: number | null }>();
        if (expired?.token_id != null) {
          await env.DB.prepare(
            "UPDATE tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
          )
            .bind(new Date().toISOString(), expired.token_id)
            .run();
        }
        return json({ error: "expired" }, 410);
      }

      // Single-use claim: the WHERE status = 'approved' guard makes this
      // atomic — exactly one concurrent poller gets the token. RETURNING
      // yields post-update values, so token_plain must NOT be cleared in
      // this statement (we'd read back the NULL we just wrote); flip the
      // status alone, deliver the plaintext, then scrub it.
      const claimed = await env.DB.prepare(
        "UPDATE pairings SET status = 'claimed' " +
          "WHERE code = ? AND status = 'approved' RETURNING token_plain",
      )
        .bind(code)
        .first<{ token_plain: string | null }>();
      if (claimed?.token_plain) {
        await env.DB.prepare(
          "UPDATE pairings SET token_plain = NULL WHERE code = ?",
        )
          .bind(code)
          .run();
        return json({ token: claimed.token_plain });
      }
      // Raced by another poller — fall through to gone.
    }

    // claimed / expired / denied (or a lost claim race)
    return json({ error: "gone" }, 410);
  }

  return notFound();
}

export function newCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}
