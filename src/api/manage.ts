// Zone 2 — management API under /settings/api/*. Caller (router) has
// already verified the Access JWT; handlers here just do the work.
//
//   GET    /settings/api/prototypes
//   POST   /settings/api/prototypes/<slug>            (web upload, zip form)
//   DELETE /settings/api/prototypes/<slug>
//   PUT    /settings/api/prototypes/<slug>/title      { title }
//   PUT    /settings/api/prototypes/<slug>/password   { password }
//   DELETE /settings/api/prototypes/<slug>/password
//   GET    /settings/api/tokens
//   POST   /settings/api/tokens                       { name } -> plaintext once
//   DELETE /settings/api/tokens/<id>                  (revoke)
//   PUT    /settings/api/tokens/<id>/name             { name }
//   GET    /settings/api/pairings                     (pending)
//   POST   /settings/api/pairings/<code>/approve
//   POST   /settings/api/pairings/<code>/deny

import type { Env } from "../types";
import { json, notFound, isValidSlug, MAX_TITLE_LEN, PAIRING_TTL_MS } from "../types";
import { deployFromZip, deletePrototype, UploadError } from "../zip";
import { mintToken } from "../auth/tokens";
import { hashPassword, newNonce } from "../auth/password-cookie";

const MAX_TOKEN_NAME_LEN = 128;

export async function handleManage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.slice("/settings/api".length);
  const method = request.method;
  const seg = path.split("/").filter((s) => s.length > 0);
  const root = seg[0];
  const second = seg[1];
  const third = seg[2];

  if (root === "prototypes") {
    if (seg.length === 1) {
      if (method === "GET") return listPrototypes(env);
      return methodNotAllowed();
    }
    if (seg.length === 2 && second !== undefined) {
      if (method === "POST") return uploadPrototype(request, env, url.origin, second);
      if (method === "DELETE") return removePrototype(env, second);
      return methodNotAllowed();
    }
    if (seg.length === 3 && second !== undefined && third === "title") {
      if (method === "PUT") return setTitle(request, env, second);
      return methodNotAllowed();
    }
    if (seg.length === 3 && second !== undefined && third === "password") {
      if (method === "PUT") return setPassword(request, env, second);
      if (method === "DELETE") return clearPassword(env, second);
      return methodNotAllowed();
    }
    return notFound();
  }

  if (root === "tokens") {
    if (seg.length === 1) {
      if (method === "GET") return listTokens(env);
      if (method === "POST") return createToken(request, env);
      return methodNotAllowed();
    }
    if (seg.length === 2 && second !== undefined) {
      if (method === "DELETE") return revokeToken(env, second);
      return methodNotAllowed();
    }
    if (seg.length === 3 && second !== undefined && third === "name") {
      if (method === "PUT") return renameToken(request, env, second);
      return methodNotAllowed();
    }
    return notFound();
  }

  if (root === "pairings") {
    if (seg.length === 1) {
      if (method === "GET") return listPairings(env);
      return methodNotAllowed();
    }
    if (seg.length === 3 && second !== undefined && (third === "approve" || third === "deny")) {
      if (method === "POST") {
        return third === "approve" ? approvePairing(env, second) : denyPairing(env, second);
      }
      return methodNotAllowed();
    }
    return notFound();
  }

  return notFound();
}

// --- prototypes ---

interface PrototypeRow {
  slug: string;
  title: string;
  created_at: string;
  updated_at: string;
  files: number;
  bytes: number;
  protected: number; // D1 has no booleans; 0/1 from the IS NOT NULL expression
}

async function listPrototypes(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT slug, title, created_at, updated_at, files, bytes,
            (password_hash IS NOT NULL) AS protected
     FROM prototypes
     ORDER BY updated_at DESC`,
  ).all<PrototypeRow>();
  const prototypes = results.map((r) => ({
    slug: r.slug,
    title: r.title,
    created_at: r.created_at,
    updated_at: r.updated_at,
    files: r.files,
    bytes: r.bytes,
    protected: r.protected === 1,
  }));
  return json({ prototypes });
}

async function uploadPrototype(
  request: Request,
  env: Env,
  origin: string,
  slug: string,
): Promise<Response> {
  if (!isValidSlug(slug)) return json({ error: "invalid slug" }, 400);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "expected multipart form data" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "missing 'file' field (zip)" }, 400);
  }

  try {
    const result = await deployFromZip(env, slug, new Uint8Array(await file.arrayBuffer()));
    return json({
      url: `${origin}/${slug}/`,
      slug: result.slug,
      files: result.files,
      bytes: result.bytes,
    });
  } catch (err) {
    if (err instanceof UploadError) return json({ error: err.message }, err.status);
    throw err;
  }
}

async function removePrototype(env: Env, slug: string): Promise<Response> {
  try {
    await deletePrototype(env, slug);
  } catch (err) {
    if (err instanceof UploadError) return json({ error: err.message }, err.status);
    throw err;
  }
  return json({ ok: true });
}

async function setTitle(request: Request, env: Env, slug: string): Promise<Response> {
  const body = await readJson(request);
  const raw = body?.["title"];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return json({ error: "title must be a non-empty string" }, 400);
  }
  const title = raw.trim().slice(0, MAX_TITLE_LEN);
  const res = await env.DB.prepare("UPDATE prototypes SET title = ?1 WHERE slug = ?2")
    .bind(title, slug)
    .run();
  if (res.meta.changes === 0) return notFound("unknown slug");
  return json({ ok: true });
}

async function setPassword(request: Request, env: Env, slug: string): Promise<Response> {
  const body = await readJson(request);
  const password = body?.["password"];
  if (typeof password !== "string" || password.length === 0) {
    return json({ error: "password must be a non-empty string" }, 400);
  }
  const { hash, salt } = await hashPassword(password);
  const res = await env.DB.prepare(
    `UPDATE prototypes
     SET password_hash = ?1, password_salt = ?2, cookie_nonce = ?3
     WHERE slug = ?4`,
  )
    .bind(hash, salt, newNonce(), slug)
    .run();
  if (res.meta.changes === 0) return notFound("unknown slug");
  return json({ ok: true });
}

async function clearPassword(env: Env, slug: string): Promise<Response> {
  // Rotate the nonce even though the hash is cleared: outstanding cookies
  // must not survive a remove-then-set-again cycle.
  const res = await env.DB.prepare(
    `UPDATE prototypes
     SET password_hash = NULL, password_salt = NULL, cookie_nonce = ?1
     WHERE slug = ?2`,
  )
    .bind(newNonce(), slug)
    .run();
  if (res.meta.changes === 0) return notFound("unknown slug");
  return json({ ok: true });
}

// --- tokens ---

interface TokenListRow {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

async function listTokens(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, name, created_at, last_used_at, revoked_at
     FROM tokens
     ORDER BY created_at DESC`,
  ).all<TokenListRow>();
  return json({ tokens: results });
}

async function createToken(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const raw = body?.["name"];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return json({ error: "name must be a non-empty string" }, 400);
  }
  const name = raw.trim().slice(0, MAX_TOKEN_NAME_LEN);
  const { plaintext, id } = await mintToken(env, name);
  return json({ id, name, token: plaintext });
}

async function renameToken(request: Request, env: Env, idSeg: string): Promise<Response> {
  const id = Number(idSeg);
  if (!Number.isSafeInteger(id)) return notFound("unknown token");
  const body = await readJson(request);
  const raw = body?.["name"];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return json({ error: "name must be a non-empty string" }, 400);
  }
  const name = raw.trim().slice(0, MAX_TOKEN_NAME_LEN);
  // Renaming a revoked token is allowed — the name is just a label.
  const res = await env.DB.prepare("UPDATE tokens SET name = ?1 WHERE id = ?2")
    .bind(name, id)
    .run();
  if (res.meta.changes === 0) return notFound("unknown token");
  return json({ ok: true, name });
}

async function revokeToken(env: Env, idSeg: string): Promise<Response> {
  const id = Number(idSeg);
  if (!Number.isSafeInteger(id)) return notFound("unknown token");
  const res = await env.DB.prepare(
    "UPDATE tokens SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL",
  )
    .bind(new Date().toISOString(), id)
    .run();
  if (res.meta.changes === 0) return notFound("unknown token");
  return json({ ok: true });
}

// --- pairings ---

interface PairingRow {
  code: string;
  requester: string;
  status: string;
  created_at: string;
  expires_at: string;
}

async function listPairings(env: Env): Promise<Response> {
  const now = new Date().toISOString();
  // Opportunistically expire stale pending rows (ISO strings compare
  // lexicographically, same format throughout).
  await env.DB.prepare(
    "UPDATE pairings SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?1",
  )
    .bind(now)
    .run();
  await sweepStaleApprovals(env, now);
  const { results } = await env.DB.prepare(
    `SELECT code, requester, created_at, expires_at
     FROM pairings
     WHERE status = 'pending'
     ORDER BY created_at DESC`,
  ).all<Omit<PairingRow, "status">>();
  return json({ pairings: results });
}

async function approvePairing(env: Env, code: string): Promise<Response> {
  const row = await getPairing(env, code);
  if (!row) return notFound("unknown code");
  const gone = await guardPending(env, row);
  if (gone) return gone;

  const { plaintext, id } = await mintToken(env, row.requester);
  // Approval opens a fresh 5-minute claim window; token_id lets the sweep
  // revoke the token if it is never claimed. The AND status = 'pending'
  // guard prevents concurrent approvals minting orphaned tokens.
  const claimExpiry = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
  const res = await env.DB.prepare(
    `UPDATE pairings SET token_plain = ?1, token_id = ?2, status = 'approved', expires_at = ?3
     WHERE code = ?4 AND status = 'pending'`,
  )
    .bind(plaintext, id, claimExpiry, row.code)
    .run();
  if (res.meta.changes === 0) {
    // Raced by another approve/deny — revoke the token we just minted.
    await env.DB.prepare("UPDATE tokens SET revoked_at = ?1 WHERE id = ?2")
      .bind(new Date().toISOString(), id)
      .run();
    return json({ error: "pairing is no longer pending" }, 410);
  }
  return json({ ok: true });
}

async function denyPairing(env: Env, code: string): Promise<Response> {
  const row = await getPairing(env, code);
  if (!row) return notFound("unknown code");
  const gone = await guardPending(env, row);
  if (gone) return gone;

  const res = await env.DB.prepare(
    "UPDATE pairings SET status = 'denied' WHERE code = ?1 AND status = 'pending'",
  )
    .bind(row.code)
    .run();
  if (res.meta.changes === 0) return json({ error: "pairing is no longer pending" }, 410);
  return json({ ok: true });
}

/**
 * Approved pairings whose claim window lapsed: clear the plaintext and
 * revoke the never-delivered tokens (spec: plaintext lives ≤5 minutes).
 */
async function sweepStaleApprovals(env: Env, now: string): Promise<void> {
  const { results } = await env.DB.prepare(
    `UPDATE pairings SET token_plain = NULL, status = 'expired'
     WHERE status = 'approved' AND expires_at <= ?1
     RETURNING token_id`,
  )
    .bind(now)
    .all<{ token_id: number | null }>();
  for (const r of results) {
    if (r.token_id != null) {
      await env.DB.prepare(
        "UPDATE tokens SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL",
      )
        .bind(now, r.token_id)
        .run();
    }
  }
}

async function getPairing(env: Env, code: string): Promise<PairingRow | null> {
  return env.DB.prepare(
    "SELECT code, requester, status, created_at, expires_at FROM pairings WHERE code = ?1",
  )
    .bind(code)
    .first<PairingRow>();
}

/** 410 when the row is not actionable (not pending, or expired); null when OK. */
async function guardPending(env: Env, row: PairingRow): Promise<Response | null> {
  if (row.status !== "pending") return json({ error: `pairing is ${row.status}` }, 410);
  if (row.expires_at <= new Date().toISOString()) {
    await env.DB.prepare("UPDATE pairings SET status = 'expired' WHERE code = ?1")
      .bind(row.code)
      .run();
    return json({ error: "pairing expired" }, 410);
  }
  return null;
}

// --- helpers ---

function methodNotAllowed(): Response {
  return json({ error: "method not allowed" }, 405);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      return body as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
