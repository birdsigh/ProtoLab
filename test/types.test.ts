import { describe, expect, it } from "vitest";
import { isValidSlug } from "../src/types";
import { contentTypeFor } from "../src/zip";
import { newCode } from "../src/api/pair";

describe("isValidSlug", () => {
  it("accepts normal slugs", () => {
    for (const s of ["a", "my-idea", "proto-2", "a".repeat(63)]) {
      expect(isValidSlug(s), s).toBe(true);
    }
  });

  it("rejects invalid shapes", () => {
    for (const s of ["", "-lead", "UPPER", "has space", "dot.name", "a".repeat(64), "café"]) {
      expect(isValidSlug(s), s).toBe(false);
    }
  });

  it("rejects reserved names and _ prefix", () => {
    for (const s of ["settings", "api", "favicon.ico", "robots.txt", "_private"]) {
      expect(isValidSlug(s), s).toBe(false);
    }
  });
});

describe("contentTypeFor", () => {
  it("maps known extensions", () => {
    expect(contentTypeFor("index.html")).toContain("text/html");
    expect(contentTypeFor("a/b/style.CSS")).toContain("text/css");
    expect(contentTypeFor("app.mjs")).toContain("javascript");
    expect(contentTypeFor("img.svg")).toBe("image/svg+xml");
  });

  it("falls back to octet-stream", () => {
    expect(contentTypeFor("archive.tar.zst")).toBe("application/octet-stream");
    expect(contentTypeFor("noextension")).toBe("application/octet-stream");
  });
});

describe("newCode", () => {
  it("generates codes of the right length and alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = newCode();
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
      expect(code).not.toMatch(/[01OI]/);
    }
  });
});
