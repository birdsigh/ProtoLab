import { describe, expect, it } from "vitest";
import { handleManage } from "../src/api/manage";
import { serveGallery } from "../src/serve";
import { deployFromHtml } from "../src/zip";
import { fakeEnv, SqliteD1 } from "./helpers";

const BASE = "https://lab.example.com";
const enc = new TextEncoder();

function envWithDb() {
  const db = new SqliteD1();
  return { db, env: fakeEnv({ DB: db }) };
}

function seedPrototype(
  db: SqliteD1,
  slug: string,
  options: { listed?: boolean; protected?: boolean } = {},
) {
  db.raw
    .prepare(
      `INSERT INTO prototypes
       (slug, title, created_at, updated_at, files, bytes, listed, password_hash)
       VALUES (?, ?, ?, ?, 1, 10, ?, ?)`,
    )
    .run(
      slug,
      `Title ${slug}`,
      "2026-08-13T00:00:00Z",
      "2026-08-13T00:00:00Z",
      options.listed ? 1 : 0,
      options.protected ? "hash" : null,
    );
}

function manageRequest(path: string, listed: unknown): Request {
  return new Request(`${BASE}/settings/api/prototypes/${path}/listed`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listed }),
  });
}

describe("prototype landing-page visibility", () => {
  it("keeps newly deployed prototypes hidden by default", async () => {
    const { db, env } = envWithDb();

    await deployFromHtml(env, "new-prototype", enc.encode("<title>New prototype</title>"));

    const row = db.raw
      .prepare("SELECT listed FROM prototypes WHERE slug = ?")
      .get("new-prototype") as { listed: number };
    expect(row.listed).toBe(0);
  });

  it("lists only opted-in, unprotected prototypes in the gallery", async () => {
    const { db, env } = envWithDb();
    seedPrototype(db, "hidden");
    seedPrototype(db, "visible", { listed: true });
    seedPrototype(db, "protected", { listed: true, protected: true });

    const body = await (await serveGallery(env)).text();

    expect(body).toContain("/visible/");
    expect(body).not.toContain("/hidden/");
    expect(body).not.toContain("/protected/");
  });

  it("toggles listing through the management API", async () => {
    const { db, env } = envWithDb();
    seedPrototype(db, "toggle-me");

    const response = await handleManage(manageRequest("toggle-me", true), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, listed: true });
    const row = db.raw
      .prepare("SELECT listed FROM prototypes WHERE slug = ?")
      .get("toggle-me") as { listed: number };
    expect(row.listed).toBe(1);
  });

  it("does not allow protected prototypes to be listed", async () => {
    const { db, env } = envWithDb();
    seedPrototype(db, "private", { protected: true });

    const response = await handleManage(manageRequest("private", true), env);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "password-protected prototypes cannot be listed",
    });
  });

  it("validates listing values", async () => {
    const { db, env } = envWithDb();
    seedPrototype(db, "invalid-value");

    const response = await handleManage(manageRequest("invalid-value", "yes"), env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "listed must be a boolean" });
  });
});
