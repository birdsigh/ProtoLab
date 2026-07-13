// Upload pipeline shared by Zone 1 (PUT deploy) and Zone 2 (web upload).
// Unpacks with fflate, validates, writes to R2 with replace semantics,
// upserts the D1 row. Guardrails per SPEC.md: 25 MB zip, 500 entries,
// no absolute/.. paths, decompressed-size cap.

import { unzipSync } from "fflate";
import type { Env } from "./types";
import { MAX_ENTRIES, MAX_UNPACKED_BYTES, MAX_ZIP_BYTES } from "./types";

export interface DeployResult {
  slug: string;
  files: number;
  bytes: number;
  title: string;
}

export class UploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/**
 * Deploy a prototype from a zip (or a raw single HTML file wrapped as
 * index.html by the caller). Replace semantics: write new objects, then
 * delete stale <slug>/ keys. Upserts D1 (title, files, bytes).
 */
export async function deployFromZip(
  env: Env,
  slug: string,
  zipBytes: Uint8Array,
): Promise<DeployResult> {
  if (zipBytes.byteLength > MAX_ZIP_BYTES) {
    throw new UploadError(`zip exceeds ${MAX_ZIP_BYTES} bytes`, 413);
  }

  // Validate declared sizes and entry counts BEFORE inflating anything —
  // a 25 MB zip can otherwise expand past Worker memory (zip bomb) before
  // the post-decompression checks in validateEntries ever run. The filter
  // sees each entry's declared originalSize pre-inflation.
  let entryCount = 0;
  let declaredTotal = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBytes, {
      filter: (info) => {
        if (info.name.endsWith("/")) return false; // directory entries
        entryCount++;
        if (entryCount > MAX_ENTRIES) {
          throw new UploadError(`more than ${MAX_ENTRIES} entries`, 413);
        }
        declaredTotal += info.originalSize;
        if (declaredTotal > MAX_UNPACKED_BYTES) {
          throw new UploadError("decompressed size cap exceeded", 413);
        }
        return true;
      },
    });
  } catch (err) {
    if (err instanceof UploadError) throw err;
    throw new UploadError("invalid zip");
  }

  const files = validateEntries(entries);
  return deployFiles(env, slug, files);
}

/** Wrap a raw HTML body as a one-file deploy (Content-Type: text/html path). */
export async function deployFromHtml(
  env: Env,
  slug: string,
  html: Uint8Array,
): Promise<DeployResult> {
  if (html.byteLength > MAX_UNPACKED_BYTES) {
    throw new UploadError("decompressed size cap exceeded", 413);
  }
  const files = new Map<string, Uint8Array>([["index.html", html]]);
  return deployFiles(env, slug, files);
}

export async function deletePrototype(env: Env, slug: string): Promise<void> {
  const row = await env.DB.prepare("SELECT slug FROM prototypes WHERE slug = ?1")
    .bind(slug)
    .first();
  if (!row) throw new UploadError("unknown slug", 404);

  const keys = await listKeys(env, `${slug}/`);
  await deleteKeys(env, keys);
  await env.DB.prepare("DELETE FROM prototypes WHERE slug = ?1").bind(slug).run();
}

/**
 * Shared deploy tail: write validated files to R2, delete stale keys,
 * extract the title, upsert the D1 row.
 */
async function deployFiles(
  env: Env,
  slug: string,
  files: Map<string, Uint8Array>,
): Promise<DeployResult> {
  let bytes = 0;
  const newKeys = new Set<string>();

  // Write new objects first (replace semantics: stale deletes come after).
  for (const [path, data] of files) {
    const key = `${slug}/${path}`;
    newKeys.add(key);
    bytes += data.byteLength;
    await env.BUCKET.put(key, data, {
      httpMetadata: { contentType: contentTypeFor(path) },
    });
  }

  // Delete any pre-existing keys under the prefix that are not in the new set.
  const existing = await listKeys(env, `${slug}/`);
  await deleteKeys(env, existing.filter((key) => !newKeys.has(key)));

  const title = extractTitle(files.get("index.html")) || slug;
  const now = new Date().toISOString();

  // Title is set only on INSERT — it is editable in settings, so a redeploy
  // must not clobber it. created_at, password_*, cookie_nonce are preserved.
  await env.DB.prepare(
    `INSERT INTO prototypes (slug, title, created_at, updated_at, files, bytes)
     VALUES (?1, ?2, ?3, ?3, ?4, ?5)
     ON CONFLICT(slug) DO UPDATE SET
       updated_at = excluded.updated_at,
       files = excluded.files,
       bytes = excluded.bytes`,
  )
    .bind(slug, title, now, files.size, bytes)
    .run();

  return { slug, files: files.size, bytes, title };
}

/** List every R2 key under a prefix, following pagination cursors. */
async function listKeys(env: Env, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({ prefix, cursor });
    for (const obj of page.objects) keys.push(obj.key);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

/** Delete R2 keys in batches (R2 bulk delete caps at 1000 keys per call). */
async function deleteKeys(env: Env, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    if (batch.length > 0) await env.BUCKET.delete(batch);
  }
}

/** Extract the <title> text from index.html; empty string if missing/blank. */
function extractTitle(indexHtml: Uint8Array | undefined): string {
  if (!indexHtml) return "";
  const text = new TextDecoder().decode(indexHtml); // utf-8, non-fatal (defaults)
  const m = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1]?.trim() ?? "";
}

function validateEntries(entries: Record<string, Uint8Array>): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  let total = 0;
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith("/")) continue; // directory entry
    const path = normalizeEntryPath(name);
    total += data.byteLength;
    if (total > MAX_UNPACKED_BYTES) throw new UploadError("decompressed size cap exceeded", 413);
    files.set(path, data);
    if (files.size > MAX_ENTRIES) throw new UploadError(`more than ${MAX_ENTRIES} entries`, 413);
  }
  if (!files.has("index.html")) throw new UploadError("zip must contain index.html at its root");
  return files;
}

function normalizeEntryPath(name: string): string {
  if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) {
    throw new UploadError(`unsafe path in zip: ${name}`);
  }
  return name;
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wasm: "application/wasm",
  map: "application/json",
};

export function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}
