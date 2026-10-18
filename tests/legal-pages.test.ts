import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
describe("Public TikTok legal pages", () => {
  it("exposes independently readable privacy and terms documents", () => {
    const privacy = read("public/privacy-policy.html");
    const terms = read("public/terms-of-service.html");
    for (const doc of [privacy, terms]) {
      expect(doc).toContain('lang="id"');
      expect(doc).toContain('href="/legal.css"');
      expect(doc).toContain('href="/privacy-policy.html"');
      expect(doc).toContain('href="/terms-of-service.html"');
    }
    expect(privacy).toContain("user.info.basic");
    expect(privacy).toContain("penghapusan");
    expect(terms).toContain("persetujuan");
    expect(read("public/legal.css")).toContain(".legal-main");
  });
  it("links policies from the public workspace and sign-in view", () => {
    const app = read("src/App.tsx");
    expect((app.match(/href="\/privacy-policy.html"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((app.match(/href="\/terms-of-service.html"/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
