import { describe, expect, it } from "vitest";
import { settingsPage } from "../src/settings/index";

describe("settings upload slug validation", () => {
  it("requires a leading alphanumeric character", async () => {
    const html = await settingsPage().text();
    const match = html.match(/var SLUG_RE = (\/\^\[a-z0-9\].*?\$\/);/);

    if (!match?.[1]) throw new Error("Settings page is missing SLUG_RE");
    const slugRe = new RegExp(match[1].slice(1, -1));

    for (const slug of ["a", "my-demo", "proto-2", "demo-", "a".repeat(63)]) {
      expect(slugRe.test(slug), slug).toBe(true);
    }
    for (const slug of ["-demo", "a".repeat(64)]) {
      expect(slugRe.test(slug), slug).toBe(false);
    }
  });
});
