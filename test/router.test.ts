// Router zone-boundary tests. The management zone is /settings and
// /settings/* only — sibling paths like /settings-foo are ordinary
// prototype slugs. A raw startsWith("/settings") guard once swallowed
// them: the slug validated fine at deploy (reserved list blocks the
// exact name "settings") but every request 404'd at the router, so the
// prototype was deployable yet unservable.

import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { fakeEnv, SqliteD1 } from "./helpers";

const BASE = "https://lab.example.com";
const CTX = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;

function seededEnv(slug: string) {
  const db = new SqliteD1();
  db.raw
    .prepare(
      "INSERT INTO prototypes (slug, title, created_at, updated_at, files, bytes) VALUES (?, ?, ?, ?, 1, 10)",
    )
    .run(slug, "Test", "2026-07-13T00:00:00Z", "2026-07-13T00:00:00Z");
  return fakeEnv({ DB: db });
}

async function get(path: string, env = fakeEnv({ DB: new SqliteD1() })): Promise<Response> {
  return worker.fetch(new Request(`${BASE}${path}`), env, CTX);
}

describe("router /settings zone boundary", () => {
  it("serves a deployed prototype whose slug starts with 'settings'", async () => {
    const env = seededEnv("settings-style-preview");
    // Bare /<slug> normalizes to /<slug>/ — reaching the redirect proves
    // the request made it past the zone guard into servePrototype.
    const res = await get("/settings-style-preview", env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(`${BASE}/settings-style-preview/`);
  });

  it("404s a settings-prefixed slug that is not deployed", async () => {
    const res = await get("/settings-nope");
    expect(res.status).toBe(404);
  });

  it("404s unknown paths under /settings/ without touching prototypes", async () => {
    // Even if a prototype could shadow the path, the zone guard wins.
    const env = seededEnv("settings");
    const res = await get("/settings/deep/path", env);
    expect(res.status).toBe(404);
  });

  it("keeps /settings itself behind Access (403 without a JWT)", async () => {
    const res = await get("/settings");
    expect(res.status).toBe(403);
  });

  it("keeps /settings/api/* behind Access (403 without a JWT)", async () => {
    const res = await get("/settings/api/prototypes");
    expect(res.status).toBe(403);
  });
});
