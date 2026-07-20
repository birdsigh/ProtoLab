// Pairing lifecycle tests against REAL SQLite (node:sqlite), not the
// call-recording FakeDB. The claim path once shipped a bug the stub could
// never catch: `UPDATE ... SET token_plain = NULL ... RETURNING token_plain`
// reads back post-update values in SQLite, so the token was scrubbed before
// delivery and every approval 410'd. These tests exercise actual SQL
// semantics so that class of bug fails loudly.

import { beforeEach, describe, expect, it } from "vitest";
import { handlePair } from "../src/api/pair";
import { FakeDB, fakeEnv, SqliteD1 } from "./helpers";

const BASE = "https://lab.example.com";

function pairEnv(db: SqliteD1) {
  const allow = { limit: async () => ({ success: true }) };
  return fakeEnv({ DB: db, PAIR_RATE_LIMIT: allow, PAIR_POLL_RATE_LIMIT: allow });
}

async function createCode(env: ReturnType<typeof fakeEnv>): Promise<string> {
  const res = await handlePair(
    new Request(`${BASE}/api/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requester: "test-host" }),
    }),
    env,
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { code: string };
  return body.code;
}

function poll(env: ReturnType<typeof fakeEnv>, code: string) {
  return handlePair(new Request(`${BASE}/api/pair/${code}`), env);
}

describe("pairing rate limits", () => {
  it("returns 429 without inserting when pairing creation is rate limited", async () => {
    const db = new FakeDB();
    const env = fakeEnv({
      DB: db,
      PAIR_RATE_LIMIT: { limit: async () => ({ success: false }) },
    });

    const res = await handlePair(
      new Request(`${BASE}/api/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requester: "test-host" }),
      }),
      env,
    );

    expect(res.status).toBe(429);
    expect(db.calls).toEqual([]);
  });

  it("returns 429 without looking up a pairing when polling is rate limited", async () => {
    const db = new FakeDB();
    const env = fakeEnv({
      DB: db,
      PAIR_POLL_RATE_LIMIT: { limit: async () => ({ success: false }) },
    });

    const res = await poll(env, "ZZZZZZ");

    expect(res.status).toBe(429);
    expect(db.calls).toEqual([]);
  });
});

/** Mirror what the settings approval handler does: mint a token, stash the
 * plaintext, open a fresh 5-minute claim window. */
function approve(db: SqliteD1, code: string, token = "tok-plain-secret") {
  const now = new Date();
  db.raw
    .prepare(
      "INSERT INTO tokens (name, token_hash, created_at) VALUES (?, ?, ?)",
    )
    .run("test-host", "deadbeef", now.toISOString());
  const tokenId = db.raw
    .prepare("SELECT id FROM tokens ORDER BY id DESC LIMIT 1")
    .get() as { id: number };
  db.raw
    .prepare(
      "UPDATE pairings SET token_plain = ?, token_id = ?, status = 'approved', expires_at = ? WHERE code = ?",
    )
    .run(
      token,
      tokenId.id,
      new Date(now.getTime() + 5 * 60_000).toISOString(),
      code,
    );
  return tokenId.id;
}

describe("pairing lifecycle", () => {
  let db: SqliteD1;
  let env: ReturnType<typeof fakeEnv>;

  beforeEach(() => {
    db = new SqliteD1();
    env = pairEnv(db);
  });

  it("pending code polls 202", async () => {
    const code = await createCode(env);
    const res = await poll(env, code);
    expect(res.status).toBe(202);
  });

  it("unknown code polls 404", async () => {
    const res = await poll(env, "ZZZZZZ");
    expect(res.status).toBe(404);
  });

  it("approved code delivers the token exactly once, then scrubs it", async () => {
    const code = await createCode(env);
    approve(db, code, "tok-abc123");

    // First poll after approval: the token must actually come back.
    // (Regression: RETURNING post-update values ate it.)
    const res = await poll(env, code);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe("tok-abc123");

    // Plaintext scrubbed from D1 after delivery.
    const row = db.raw
      .prepare("SELECT token_plain, status FROM pairings WHERE code = ?")
      .get(code) as { token_plain: string | null; status: string };
    expect(row.token_plain).toBeNull();
    expect(row.status).toBe("claimed");

    // Second poll: single-use, gone.
    const again = await poll(env, code);
    expect(again.status).toBe(410);
  });

  it("pending code past expiry polls 410 and is marked expired", async () => {
    const code = await createCode(env);
    db.raw
      .prepare("UPDATE pairings SET expires_at = ? WHERE code = ?")
      .run(new Date(Date.now() - 1000).toISOString(), code);
    const res = await poll(env, code);
    expect(res.status).toBe(410);
    const row = db.raw
      .prepare("SELECT status FROM pairings WHERE code = ?")
      .get(code) as { status: string };
    expect(row.status).toBe("expired");
  });

  it("lapsed claim window scrubs the plaintext and revokes the minted token", async () => {
    const code = await createCode(env);
    const tokenId = approve(db, code, "tok-never-delivered");
    db.raw
      .prepare("UPDATE pairings SET expires_at = ? WHERE code = ?")
      .run(new Date(Date.now() - 1000).toISOString(), code);

    const res = await poll(env, code);
    expect(res.status).toBe(410);

    const pairing = db.raw
      .prepare("SELECT token_plain, status FROM pairings WHERE code = ?")
      .get(code) as { token_plain: string | null; status: string };
    expect(pairing.token_plain).toBeNull();
    expect(pairing.status).toBe("expired");

    const tok = db.raw
      .prepare("SELECT revoked_at FROM tokens WHERE id = ?")
      .get(tokenId) as { revoked_at: string | null };
    expect(tok.revoked_at).not.toBeNull();
  });

  it("denied code polls 410", async () => {
    const code = await createCode(env);
    db.raw
      .prepare("UPDATE pairings SET status = 'denied' WHERE code = ?")
      .run(code);
    const res = await poll(env, code);
    expect(res.status).toBe(410);
  });
});
