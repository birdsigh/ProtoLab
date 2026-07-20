// ProtoLab — router. Auth zones (see SPEC.md):
//   /api/*           machine API: deploy (bearer) + pairing (rate-limited)
//   /settings        management UI (Access)
//   /settings/api/*  management API (Access JWT, re-verified here)
//   /<slug>/*        prototype content from R2
//   /                public gallery

import type { Env } from "./types";
import { CSRF_HEADER, CSRF_VALUE, json, notFound } from "./types";
import { handleDeploy } from "./api/deploy";
import { handleManage } from "./api/manage";
import { handlePair } from "./api/pair";
import { requireAccessJwt } from "./auth/access-jwt";
import { serveFavicon } from "./favicon";
import { serveGallery, servePrototype } from "./serve";
import { settingsPage } from "./settings";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- Zone 3 + Zone 1: machine API ---
    if (path === "/api/pair" || path.startsWith("/api/pair/")) {
      return handlePair(request, env);
    }
    if (path.startsWith("/api/")) {
      return handleDeploy(request, env);
    }

    // --- Zone 2: management (Access JWT verified in-Worker, always) ---
    if (path === "/settings" || path === "/settings/") {
      const denied = await requireAccessJwt(request, env);
      if (denied) return denied;
      return settingsPage();
    }
    if (path.startsWith("/settings/api/")) {
      // CSRF guard: Access injects the JWT for any request carrying the
      // CF_Authorization cookie, including cross-site form POSTs. Forms
      // cannot set custom headers, so require one on all mutations.
      if (request.method !== "GET" && request.headers.get(CSRF_HEADER) !== CSRF_VALUE) {
        return json({ error: `missing ${CSRF_HEADER} header` }, 403);
      }
      const denied = await requireAccessJwt(request, env);
      if (denied) return denied;
      return handleManage(request, env);
    }
    // Only /settings and /settings/* are management-zone paths. Sibling
    // slugs like /settings-foo are valid prototypes and must fall through
    // to servePrototype (the Access app's coverage is path-segment based,
    // so the edge doesn't intercept them either).
    if (path.startsWith("/settings/")) return notFound();

    // --- Public ---
    if (path === "/") return serveGallery(env);
    // Origin-level favicon: also covers prototype pages, since browsers
    // fall back to /favicon.ico when a page declares no icon of its own.
    if (path === "/favicon.ico") return serveFavicon();
    if (path === "/robots.txt") return notFound();

    return servePrototype(request, env);
  },
} satisfies ExportedHandler<Env>;

export { json };
