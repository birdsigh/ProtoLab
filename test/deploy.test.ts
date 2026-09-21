import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import { handleDeploy } from "../src/api/deploy";
import { FakeBucket, FakeDB, fakeEnv } from "./helpers";

const BASE = "https://lab.example.com";
const enc = new TextEncoder();

function deploy(contentType: string, body: BodyInit, env = fakeEnv()) {
  (env.DB as FakeDB).firstResult = { id: 1 };
  return {
    env,
    response: handleDeploy(
      new Request(`${BASE}/api/prototypes/demo`, {
        method: "PUT",
        headers: {
          Authorization: "Bearer plab_test-token",
          "Content-Type": contentType,
        },
        body,
      }),
      env,
    ),
  };
}

describe("deploy content types", () => {
  it("uses the raw HTML path for text/html", async () => {
    const { env, response } = deploy("text/html; charset=utf-8", "<title>Raw HTML</title>");

    expect((await response).status).toBe(200);
    const object = (env.BUCKET as FakeBucket).store.get("demo/index.html");
    expect(new TextDecoder().decode(object?.data)).toBe("<title>Raw HTML</title>");
  });

  it("uses the ZIP path for application/zip", async () => {
    const zip = zipSync({
      "index.html": enc.encode("<title>Zipped</title>"),
      "assets/app.js": enc.encode("console.log('ok')"),
    });
    const { env, response } = deploy("application/zip", zip);

    expect((await response).status).toBe(200);
    expect((env.BUCKET as FakeBucket).store.has("demo/assets/app.js")).toBe(true);
  });

  it("rejects unsupported content types before processing the body", async () => {
    const { env, response } = deploy("application/json", '{"not":"a zip"}');

    const res = await response;
    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toEqual({
      error: "unsupported content type; expected application/zip or text/html",
    });
    expect((env.BUCKET as FakeBucket).store.size).toBe(0);
  });
});
