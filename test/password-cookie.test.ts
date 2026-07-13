import { describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  issueCookie,
  verifyCookie,
  newNonce,
} from "../src/auth/password-cookie";
import { fakeEnv } from "./helpers";

describe("password hashing", () => {
  it("roundtrips", async () => {
    const { hash, salt } = await hashPassword("hunter2");
    expect(await verifyPassword("hunter2", hash, salt)).toBe(true);
  });

  it("rejects wrong passwords", async () => {
    const { hash, salt } = await hashPassword("hunter2");
    expect(await verifyPassword("hunter3", hash, salt)).toBe(false);
    expect(await verifyPassword("", hash, salt)).toBe(false);
  });

  it("salts: same password, different hashes", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a.hash).not.toBe(b.hash);
  });
});

function requestWithCookie(setCookie: string): Request {
  // "plab_<slug>=<value>; Path=..." -> first segment is the cookie pair.
  const pair = setCookie.split(";")[0]!;
  return new Request("https://lab.test/x/", { headers: { Cookie: pair } });
}

describe("password cookies", () => {
  const env = fakeEnv();

  it("roundtrips with the same nonce", async () => {
    const nonce = newNonce();
    const setCookie = await issueCookie(env, "my-proto", nonce);
    expect(setCookie).toContain("plab_my-proto=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/my-proto");
    const req = requestWithCookie(setCookie);
    expect(await verifyCookie(env, req, "my-proto", nonce)).toBe(true);
  });

  it("is invalidated by nonce rotation", async () => {
    const setCookie = await issueCookie(env, "my-proto", newNonce());
    const req = requestWithCookie(setCookie);
    expect(await verifyCookie(env, req, "my-proto", newNonce())).toBe(false);
  });

  it("does not validate for a different slug", async () => {
    const nonce = newNonce();
    const setCookie = await issueCookie(env, "my-proto", nonce);
    const req = requestWithCookie(setCookie);
    expect(await verifyCookie(env, req, "other", nonce)).toBe(false);
  });

  it("rejects tampered values", async () => {
    const nonce = newNonce();
    const setCookie = await issueCookie(env, "my-proto", nonce);
    const pair = setCookie.split(";")[0]!;
    const tampered = pair.slice(0, -2) + (pair.endsWith("00") ? "11" : "00");
    const req = new Request("https://lab.test/x/", { headers: { Cookie: tampered } });
    expect(await verifyCookie(env, req, "my-proto", nonce)).toBe(false);
  });

  it("rejects requests with no cookie", async () => {
    const req = new Request("https://lab.test/x/");
    expect(await verifyCookie(env, req, "my-proto", newNonce())).toBe(false);
  });
});
