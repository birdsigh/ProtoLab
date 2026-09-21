// The served pages carry their JavaScript inline inside TS template
// literals, so a mis-escaped quote (\" where \\" was meant) collapses into
// a syntax error that silently kills the whole page script. Nothing else
// in the suite executes that code, so compile it here.
import { describe, expect, it } from "vitest";
import vm from "node:vm";
import { settingsPage } from "../src/settings/index";
import { serveGallery, servePrototype } from "../src/serve";
import { hashPassword } from "../src/auth/password-cookie";
import { fakeEnv, FakeDB, SqliteD1 } from "./helpers";

function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1] as string);
}

function expectParses(html: string, minScripts: number) {
  const scripts = inlineScripts(html);
  expect(scripts.length).toBeGreaterThanOrEqual(minScripts);
  for (const source of scripts) {
    expect(() => new vm.Script(source)).not.toThrow();
  }
}

describe("inline page scripts", () => {
  it("parses the settings page scripts", async () => {
    expectParses(await settingsPage().text(), 2);
  });

  it("parses the gallery scripts", async () => {
    const env = fakeEnv({ DB: new SqliteD1() });
    expectParses(await (await serveGallery(env)).text(), 1);
  });

  it("parses the password gate scripts", async () => {
    const { hash, salt } = await hashPassword("hunter2");
    const db = new FakeDB();
    db.firstResult = {
      slug: "gated",
      title: "Gated",
      updated_at: "2026-08-19T00:00:00Z",
      files: 1,
      bytes: 10,
      password_hash: hash,
      password_salt: salt,
      cookie_nonce: "test-nonce",
    };
    const request = new Request("https://lab.example.com/gated/");
    expectParses(await (await servePrototype(request, fakeEnv({ DB: db }))).text(), 1);
  });
});
