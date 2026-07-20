// Token management endpoints against real SQLite (SqliteD1). The router
// handles Access JWT + CSRF before handleManage, so handlers are called
// directly here.

import { beforeEach, describe, expect, it } from "vitest";
import { handleManage } from "../src/api/manage";
import { fakeEnv, SqliteD1 } from "./helpers";

const BASE = "https://lab.example.com";

function seedToken(db: SqliteD1, name = "old-name", revoked = false): number {
  db.raw
    .prepare(
      "INSERT INTO tokens (name, token_hash, created_at, revoked_at) VALUES (?, ?, ?, ?)",
    )
    .run(name, "cafebabe", new Date().toISOString(),
      revoked ? new Date().toISOString() : null);
  return (db.raw.prepare("SELECT id FROM tokens ORDER BY id DESC LIMIT 1").get() as { id: number }).id;
}

function rename(env: ReturnType<typeof fakeEnv>, id: string | number, body: unknown) {
  return handleManage(
    new Request(`${BASE}/settings/api/tokens/${id}/name`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

function revoke(env: ReturnType<typeof fakeEnv>, id: string | number) {
  return handleManage(
    new Request(`${BASE}/settings/api/tokens/${id}`, { method: "DELETE" }),
    env,
  );
}

const nonCanonicalIds = [
  "abc",
  "1.5",
  "0",
  "-1",
  "+1",
  "1e0",
  "01",
  "9007199254740992",
];

describe("token rename", () => {
  let db: SqliteD1;
  let env: ReturnType<typeof fakeEnv>;

  beforeEach(() => {
    db = new SqliteD1();
    env = fakeEnv({ DB: db });
  });

  it("renames a token", async () => {
    const id = seedToken(db, "laughing-jolly-rubin");
    const res = await rename(env, id, { name: "cowork sandbox" });
    expect(res.status).toBe(200);
    const row = db.raw.prepare("SELECT name FROM tokens WHERE id = ?").get(id) as { name: string };
    expect(row.name).toBe("cowork sandbox");
  });

  it("trims and caps the name at 128 chars", async () => {
    const id = seedToken(db);
    const res = await rename(env, id, { name: "  " + "x".repeat(200) + "  " });
    expect(res.status).toBe(200);
    const row = db.raw.prepare("SELECT name FROM tokens WHERE id = ?").get(id) as { name: string };
    expect(row.name).toBe("x".repeat(128));
  });

  it("allows renaming a revoked token (label only)", async () => {
    const id = seedToken(db, "dead", true);
    const res = await rename(env, id, { name: "was the sandbox" });
    expect(res.status).toBe(200);
  });

  it("rejects empty or missing names", async () => {
    const id = seedToken(db);
    expect((await rename(env, id, { name: "   " })).status).toBe(400);
    expect((await rename(env, id, {})).status).toBe(400);
    const row = db.raw.prepare("SELECT name FROM tokens WHERE id = ?").get(id) as { name: string };
    expect(row.name).toBe("old-name");
  });

  it("404s on an unknown id", async () => {
    expect((await rename(env, 999, { name: "x" })).status).toBe(404);
  });

  it.each(nonCanonicalIds)("404s on non-canonical id %s", async (id) => {
    seedToken(db);
    expect((await rename(env, id, {})).status).toBe(404);
  });

  it("rejects other methods on /name", async () => {
    const id = seedToken(db);
    const res = await handleManage(
      new Request(`${BASE}/settings/api/tokens/${id}/name`, { method: "DELETE" }),
      env,
    );
    expect(res.status).toBe(405);
  });
});

describe("token revoke", () => {
  let db: SqliteD1;
  let env: ReturnType<typeof fakeEnv>;

  beforeEach(() => {
    db = new SqliteD1();
    env = fakeEnv({ DB: db });
  });

  it("revokes a token", async () => {
    const id = seedToken(db);
    const res = await revoke(env, id);
    expect(res.status).toBe(200);
    const row = db.raw.prepare("SELECT revoked_at FROM tokens WHERE id = ?").get(id) as {
      revoked_at: string | null;
    };
    expect(row.revoked_at).not.toBeNull();
  });

  it.each(nonCanonicalIds)("404s on non-canonical id %s", async (id) => {
    seedToken(db);
    expect((await revoke(env, id)).status).toBe(404);
  });
});
