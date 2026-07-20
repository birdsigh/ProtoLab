import { describe, expect, it } from "vitest";
import { hashPassword } from "../src/auth/password-cookie";
import { servePrototype } from "../src/serve";
import { FakeDB, fakeEnv } from "./helpers";

const URL = "https://lab.example.com/protected/";

async function protectedEnv(password: string) {
  const { hash, salt } = await hashPassword(password);
  const db = new FakeDB();
  db.firstResult = {
    slug: "protected",
    title: "Protected",
    updated_at: "2026-07-20T00:00:00Z",
    files: 1,
    bytes: 10,
    password_hash: hash,
    password_salt: salt,
    cookie_nonce: "test-nonce",
  };
  return fakeEnv({ DB: db });
}

function passwordRequest(password: string): Request {
  const body = new URLSearchParams({ password });
  return new Request(URL, { method: "POST", body });
}

describe("protected prototype password submissions", () => {
  it("returns 400 with the password form for malformed bodies", async () => {
    const env = await protectedEnv("correct-password");
    const request = new Request(URL, {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data" },
      body: "not a multipart body",
    });

    const response = await servePrototype(request, env);

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    const body = await response.text();
    expect(body).toContain("Invalid submission");
    expect(body).toContain('name="password"');
  });

  it("redirects and sets a cookie for a valid password", async () => {
    const env = await protectedEnv("correct-password");

    const response = await servePrototype(passwordRequest("correct-password"), env);

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/protected/");
    expect(response.headers.get("Set-Cookie")).toContain("plab_protected=");
  });

  it("returns the failed password form for an invalid password", async () => {
    const env = await protectedEnv("correct-password");

    const response = await servePrototype(passwordRequest("wrong-password"), env);

    expect(response.status).toBe(403);
    expect(await response.text()).toContain("Wrong password");
  });
});
