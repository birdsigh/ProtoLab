import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { deployFromZip, deployFromHtml, deletePrototype, UploadError } from "../src/zip";
import { fakeEnv, FakeBucket, FakeDB } from "./helpers";

const enc = new TextEncoder();

function makeZip(files: Record<string, string | Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) {
    entries[name] = typeof content === "string" ? enc.encode(content) : content;
  }
  return zipSync(entries);
}

describe("deployFromZip", () => {
  it("deploys a valid zip: writes R2, upserts D1, extracts title", async () => {
    const env = fakeEnv();
    const bucket = env.BUCKET as FakeBucket;
    const db = env.DB as FakeDB;

    const zip = makeZip({
      "index.html": "<html><head><title>  My Proto </title></head></html>",
      "css/style.css": "body{}",
    });
    const result = await deployFromZip(env, "demo", zip);

    expect(result).toMatchObject({ slug: "demo", files: 2, title: "My Proto" });
    expect(result.bytes).toBeGreaterThan(0);
    expect(bucket.store.get("demo/index.html")?.contentType).toContain("text/html");
    expect(bucket.store.get("demo/css/style.css")?.contentType).toContain("text/css");
    const upsert = db.calls.find((c) => c.sql.includes("INSERT INTO prototypes"));
    expect(upsert?.args).toContain("My Proto");
  });

  it("replace semantics: deletes stale keys not in the new set", async () => {
    const env = fakeEnv();
    const bucket = env.BUCKET as FakeBucket;
    bucket.store.set("demo/old.js", { data: enc.encode("stale") });
    bucket.store.set("other/index.html", { data: enc.encode("untouched") });

    await deployFromZip(env, "demo", makeZip({ "index.html": "<title>x</title>" }));

    expect(bucket.store.has("demo/old.js")).toBe(false);
    expect(bucket.store.has("demo/index.html")).toBe(true);
    expect(bucket.store.has("other/index.html")).toBe(true);
  });

  it("replace semantics: deletes stale keys across paginated listings", async () => {
    const bucket = new FakeBucket(2);
    const env = fakeEnv({ BUCKET: bucket });
    bucket.store.set("demo/old-a.js", { data: enc.encode("stale") });
    bucket.store.set("demo/old-b.js", { data: enc.encode("stale") });
    bucket.store.set("demo/old-c.js", { data: enc.encode("stale") });
    bucket.store.set("other/index.html", { data: enc.encode("untouched") });

    await deployFromZip(env, "demo", makeZip({ "index.html": "<title>x</title>" }));

    expect(bucket.listCalls).toEqual([
      { prefix: "demo/", cursor: undefined },
      { prefix: "demo/", cursor: "2" },
    ]);
    expect([...bucket.store.keys()]).toEqual(["other/index.html", "demo/index.html"]);
  });

  it("falls back to the slug when index.html has no title", async () => {
    const env = fakeEnv();
    const result = await deployFromZip(env, "untitled", makeZip({ "index.html": "<p>hi</p>" }));
    expect(result.title).toBe("untitled");
  });

  it("rejects zips without a root index.html", async () => {
    const env = fakeEnv();
    await expect(
      deployFromZip(env, "demo", makeZip({ "sub/index.html": "<title>x</title>" })),
    ).rejects.toThrow(/index\.html/);
  });

  it("rejects path traversal", async () => {
    const env = fakeEnv();
    await expect(
      deployFromZip(env, "demo", makeZip({ "index.html": "x", "../evil.html": "x" })),
    ).rejects.toThrow(/unsafe path/);
  });

  it("rejects more than 500 entries before inflating", async () => {
    const env = fakeEnv();
    const files: Record<string, string> = { "index.html": "<title>x</title>" };
    for (let i = 0; i < 501; i++) files[`f${i}.txt`] = "x";
    await expect(deployFromZip(env, "demo", makeZip(files))).rejects.toThrow(/entries/);
  });

  it("rejects declared decompressed size over the cap (zip bomb)", async () => {
    const env = fakeEnv();
    // 101 MB of zeros compresses to a tiny zip; the declared-size filter
    // must reject it before inflation.
    const bomb = new Uint8Array(101 * 1024 * 1024);
    const zip = makeZip({ "index.html": "<title>x</title>", "bomb.bin": bomb });
    await expect(deployFromZip(env, "demo", zip)).rejects.toThrow(/size cap/);
  });

  it("rejects invalid zip bytes", async () => {
    const env = fakeEnv();
    await expect(deployFromZip(env, "demo", enc.encode("not a zip"))).rejects.toThrow(
      UploadError,
    );
  });
});

describe("deployFromHtml", () => {
  it("wraps raw HTML as index.html", async () => {
    const env = fakeEnv();
    const bucket = env.BUCKET as FakeBucket;
    const result = await deployFromHtml(env, "single", enc.encode("<title>One</title>"));
    expect(result).toMatchObject({ slug: "single", files: 1, title: "One" });
    expect(bucket.store.has("single/index.html")).toBe(true);
  });
});

describe("deletePrototype", () => {
  it("404s on unknown slugs", async () => {
    const env = fakeEnv();
    (env.DB as FakeDB).firstResult = null;
    await expect(deletePrototype(env, "ghost")).rejects.toMatchObject({ status: 404 });
  });

  it("deletes all R2 keys under the prefix", async () => {
    const env = fakeEnv();
    const bucket = env.BUCKET as FakeBucket;
    (env.DB as FakeDB).firstResult = { slug: "demo" };
    bucket.store.set("demo/index.html", { data: enc.encode("x") });
    bucket.store.set("demo/a/b.css", { data: enc.encode("x") });
    bucket.store.set("demos/index.html", { data: enc.encode("keep") });

    await deletePrototype(env, "demo");

    expect(bucket.store.has("demo/index.html")).toBe(false);
    expect(bucket.store.has("demo/a/b.css")).toBe(false);
    expect(bucket.store.has("demos/index.html")).toBe(true);
  });
});
