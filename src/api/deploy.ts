// Zone 1 — deploy API (bearer token). See SPEC.md.
//   PUT    /api/prototypes/<slug>   zip (application/zip) or raw text/html
//   DELETE /api/prototypes/<slug>
//   GET    /api/health

import type { Env } from "../types";
import { isValidSlug, json, notFound } from "../types";
import { verifyBearer } from "../auth/tokens";
import { deployFromHtml, deployFromZip, deletePrototype, UploadError } from "../zip";

export async function handleDeploy(
  request: Request,
  env: Env,
): Promise<Response> {
  const token = await verifyBearer(request, env);
  if (!token) return json({ error: "invalid or revoked token" }, 401);

  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/health" && request.method === "GET") {
    // TODO(build): lab_name from config/vars if we add one.
    return json({ ok: true, lab_name: url.hostname, base_url: url.origin });
  }

  const m = path.match(/^\/api\/prototypes\/([^/]+)$/);
  if (!m || !m[1]) return notFound();
  const slug = m[1];
  if (!isValidSlug(slug)) return json({ error: "invalid or reserved slug" }, 400);

  try {
    if (request.method === "PUT") {
      const body = new Uint8Array(await request.arrayBuffer());
      const contentType = request.headers.get("Content-Type") ?? "";
      const result = contentType.includes("text/html")
        ? await deployFromHtml(env, slug, body)
        : await deployFromZip(env, slug, body);
      // Contract per AGENTS.md: { url, slug, files, bytes } — no extras.
      return json({
        url: `${url.origin}/${slug}/`,
        slug: result.slug,
        files: result.files,
        bytes: result.bytes,
      });
    }
    if (request.method === "DELETE") {
      await deletePrototype(env, slug);
      return json({ ok: true });
    }
  } catch (err) {
    if (err instanceof UploadError) return json({ error: err.message }, err.status);
    throw err;
  }

  return json({ error: "method not allowed" }, 405);
}
