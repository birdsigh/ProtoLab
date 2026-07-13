// Minimal in-memory fakes for the bits of Env the pure-logic tests touch.
// Runs under plain vitest/node — no Workers runtime needed.

export interface StoredObject {
  data: Uint8Array;
  contentType?: string;
}

export class FakeBucket {
  store = new Map<string, StoredObject>();

  async put(
    key: string,
    data: Uint8Array,
    opts?: { httpMetadata?: { contentType?: string } },
  ): Promise<void> {
    this.store.set(key, { data, contentType: opts?.httpMetadata?.contentType });
  }

  async list(opts: { prefix: string; cursor?: string }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }> {
    const objects = [...this.store.keys()]
      .filter((k) => k.startsWith(opts.prefix))
      .map((key) => ({ key }));
    return { objects, truncated: false };
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const k of Array.isArray(keys) ? keys : [keys]) this.store.delete(k);
  }
}

export interface DbCall {
  sql: string;
  args: unknown[];
}

export class FakeDB {
  calls: DbCall[] = [];
  /** Return value for .first(); may be a function of (sql, args). */
  firstResult: unknown | ((sql: string, args: unknown[]) => unknown) = null;

  prepare(sql: string) {
    const db = this;
    return {
      bind(...args: unknown[]) {
        return {
          async run() {
            db.calls.push({ sql, args });
            return { meta: { changes: 1 }, results: [] };
          },
          async first() {
            db.calls.push({ sql, args });
            return typeof db.firstResult === "function"
              ? (db.firstResult as (s: string, a: unknown[]) => unknown)(sql, args)
              : db.firstResult;
          },
          async all() {
            db.calls.push({ sql, args });
            return { results: [] };
          },
        };
      },
    };
  }
}

export function fakeEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: new FakeDB(),
    BUCKET: new FakeBucket(),
    COOKIE_SECRET: "test-secret-please-ignore",
    ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    ACCESS_AUD: "test-aud",
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
