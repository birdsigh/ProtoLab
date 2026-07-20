// Public serving: gallery at /, prototype content at /<slug>/<path>.
// Trailing slash (or bare /<slug>/) rewrites to index.html. Protected
// slugs get a password form until a valid plab_<slug> cookie is present.

import type { Env } from "./types";
import { isValidSlug, notFound } from "./types";
import { issueCookie, verifyCookie, verifyPassword } from "./auth/password-cookie";
import { LOGO_INK_DARK, LOGO_INK_LIGHT } from "./settings";

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
    "SELECT slug, title FROM prototypes " +
      "WHERE password_hash IS NULL ORDER BY updated_at DESC",
  ).all<PrototypeRow>();

  const items = results
    .map(
      (p) =>
        `<a class="card" href="/${p.slug}/">` +
        `<span class="title">${escapeHtml(p.title)}</span>` +
        `<span class="slug">/${p.slug}/</span>` +
        `</a>`,
    )
    .join("\n");
  return html("ProtoLab", `${pageHead("Prototypes")}\n<div class="grid">\n${items}\n</div>`);
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
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return passwordForm(slug, true, 400, "Invalid submission &mdash; try again.");
        }
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

function passwordForm(
  slug: string,
  failed: boolean,
  status = failed ? 403 : 401,
  error = "Wrong password &mdash; try again.",
): Response {
  const body =
    `<div class="gate">` +
    `<div class="gate-card">` +
    `<svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>` +
    `<h1>This prototype is protected</h1>` +
    `<p class="gate-slug">/${escapeHtml(slug)}/</p>` +
    (failed ? `<p class="gate-err">${error}</p>` : "") +
    `<form method="post">` +
    `<input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password" aria-label="Password">` +
    `<button class="primary">View prototype</button>` +
    `</form>` +
    `</div></div>`;
  return html(`${escapeHtml(slug)} — protected`, body, status);
}

// Shared page chrome: same design tokens and pre-paint theme resolution as
// the settings page (see src/settings/index.ts), trimmed to what these two
// small public pages use. Logos are imported, not duplicated.
function pageHead(subtitle: string): string {
  return (
    `<header class="page-head">` +
    `<img class="logo logo-for-light" src="${LOGO_INK_DARK}" alt="ProtoLab">` +
    `<img class="logo logo-for-dark" src="${LOGO_INK_LIGHT}" alt="ProtoLab">` +
    `<span class="subtitle">${escapeHtml(subtitle)}</span>` +
    `</header>`
  );
}

const THEME_BOOT = `(function () {
  var mode = null;
  try {
    var s = JSON.parse(localStorage.getItem("protolab-theme") || "null");
    if (s && (s.mode === "light" || s.mode === "dark") &&
        Date.now() - (s.ts || 0) < 31536000000) mode = s.mode;
  } catch (e) {}
  document.documentElement.setAttribute("data-theme",
    mode || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
})();`;

const STYLES = `
:root {
  color-scheme: light;
  --bg: #ffffff; --fg: #1c2734; --muted: #627080; --border: #e4e8ed;
  --card: #f7f9fb; --accent: #17639f; --accent-ink: #15395e;
  --danger: #ab372c; --danger-pale: #f7e5e1;
  --ring: rgba(23, 99, 159, 0.22); --radius: 6px;
  --shadow-sm: 0 1px 2px 0 rgba(23, 40, 69, 0.06);
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #14181e; --fg: #e4e8ee; --muted: #94a0af; --border: #2b323c;
  --card: #1a2028; --accent: #7fb2dd; --accent-ink: #a8cce9;
  --danger: #e08d83; --danger-pale: rgba(224, 141, 131, 0.13);
  --ring: rgba(127, 178, 221, 0.3);
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.4);
}
* { box-sizing: border-box; }
body {
  margin: 0 auto; padding: 28px 20px 64px; max-width: 900px;
  background: var(--bg); color: var(--fg);
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.page-head { display: flex; align-items: baseline; gap: 12px; margin: 0 0 24px; }
img.logo { height: 28px; display: block; align-self: center; }
img.logo-for-dark { display: none; }
:root[data-theme="dark"] img.logo-for-light { display: none; }
:root[data-theme="dark"] img.logo-for-dark { display: block; }
.subtitle { color: var(--muted); font-size: 14px; }
.grid {
  display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}
a.card {
  display: flex; flex-direction: column; gap: 2px;
  padding: 14px 16px;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: var(--shadow-sm);
  color: inherit; text-decoration: none;
  transition: border-color 0.15s ease;
}
a.card:hover { border-color: var(--accent); }
a.card:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }
.card .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card .slug {
  color: var(--accent); font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.gate { display: flex; justify-content: center; padding-top: 8vh; }
.gate-card {
  width: 100%; max-width: 360px; text-align: center;
  padding: 28px 24px;
  background: var(--card); border: 1px solid var(--border);
  border-radius: 8px; box-shadow: var(--shadow-sm);
}
.gate .lock { width: 26px; height: 26px; color: var(--muted); }
.gate h1 { font-size: 17px; font-weight: 600; margin: 10px 0 2px; }
.gate-slug {
  margin: 0 0 16px; color: var(--muted); font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.gate-err {
  margin: 0 0 12px; padding: 6px 10px; font-size: 13px;
  color: var(--danger); background: var(--danger-pale);
  border-left: 3px solid var(--danger); border-radius: var(--radius);
  text-align: left;
}
.gate form { display: flex; flex-direction: column; gap: 10px; }
input[type="password"] {
  font: inherit; font-size: 14px; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg); color: var(--fg); box-shadow: var(--shadow-sm);
}
input[type="password"]:focus-visible {
  outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring);
}
::placeholder { color: var(--muted); opacity: 0.8; }
button.primary {
  font: inherit; font-size: 13px; font-weight: 600; padding: 7px 12px;
  border: 1px solid var(--accent); border-radius: var(--radius);
  background: var(--accent); color: #fff; cursor: pointer;
  transition: background-color 0.15s ease;
}
button.primary:hover { background: var(--accent-ink); border-color: var(--accent-ink); }
button.primary:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }
:root[data-theme="dark"] button.primary { color: #10131a; }
`;

function html(title: string, body: string, status = 200): Response {
  const page =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<link rel="icon" type="image/png" href="/favicon.ico">` +
    `<title>${title}</title>` +
    `<script>${THEME_BOOT}</script>` +
    `<style>${STYLES}</style>` +
    `</head><body>${body}</body></html>`;
  return new Response(page, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
