// Public serving: gallery at /, prototype content at /<slug>/<path>.
// Trailing slash (or bare /<slug>/) rewrites to index.html. Protected
// slugs get a password form until a valid plab_<slug> cookie is present.

import type { Env } from "./types";
import { isValidSlug, notFound } from "./types";
import { issueCookie, verifyCookie, verifyPassword } from "./auth/password-cookie";

interface PrototypeRow {
  slug: string;
  title: string;
  updated_at: string;
  files: number;
  bytes: number;
  password_hash: string | null;
  password_salt: string | null;
  cookie_nonce: string | null;
}

export async function serveGallery(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT slug, title, updated_at, files, bytes FROM prototypes " +
      "WHERE password_hash IS NULL ORDER BY updated_at DESC",
  ).all<PrototypeRow>();

  // TODO(build): real gallery template.
  const items = results
    .map((p) => `<li><a href="/${p.slug}/">${escapeHtml(p.title)}</a> <small>${p.updated_at}</small></li>`)
    .join("\n");
  return html(`<h1>ProtoLab</h1>\n<ul>\n${items}\n</ul>`);
}

export async function servePrototype(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.slice(1).split("/");
  const slug = segments[0] ?? "";
  if (!isValidSlug(slug)) return notFound();

  const row = await env.DB.prepare("SELECT * FROM prototypes WHERE slug = ?")
    .bind(slug)
    .first<PrototypeRow>();
  if (!row) return notFound();

  // No bare /<slug> — normalize to /<slug>/ so relative asset paths work.
  if (segments.length === 1) return Response.redirect(`${url.origin}/${slug}/`, 302);

  // Password gate — no content leaks on any path, assets included. Check
  // the cookie FIRST: a prototype containing a self-posting form must not
  // have its POSTs swallowed as password attempts once the viewer is in.
  if (row.password_hash && row.password_salt && row.cookie_nonce) {
    const authed = await verifyCookie(env, request, slug, row.cookie_nonce);
    if (!authed) {
      if (request.method === "POST") {
        const form = await request.formData();
        const password = String(form.get("password") ?? "");
        if (await verifyPassword(password, row.password_hash, row.password_salt)) {
          const cookie = await issueCookie(env, slug, row.cookie_nonce);
          return new Response(null, {
            status: 303,
            headers: { Location: url.pathname, "Set-Cookie": cookie },
          });
        }
        return passwordForm(slug, true);
      }
      return passwordForm(slug, false);
    }
  }

  let path = segments.slice(1).join("/");
  if (path === "" || path.endsWith("/")) path += "index.html";

  // onlyIf honors If-None-Match etc.; on a failed precondition R2 returns
  // the object metadata without a body → 304.
  const object = await env.BUCKET.get(`${slug}/${path}`, { onlyIf: request.headers });
  if (!object) return notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  if (!("body" in object) || !object.body) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { headers });
}

function passwordForm(slug: string, failed: boolean): Response {
  // TODO(build): nicer template.
  return html(
    `<h1>Protected</h1>` +
      (failed ? `<p>Wrong password.</p>` : "") +
      `<form method="post"><input type="password" name="password" autofocus>` +
      `<button>View ${escapeHtml(slug)}</button></form>`,
    failed ? 403 : 401,
  );
}

function html(body: string, status = 200): Response {
  return new Response(`<!doctype html><meta charset="utf-8">${body}`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
