import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { creatorProfileUrl, monitoringScopes } from "../worker/tiktok";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("read-only TikTok monitor and public fallback", () => {
  it("requests only read scopes for a new connection", () => {
    expect(monitoringScopes).toEqual([
      "user.info.basic",
      "user.info.profile",
      "user.info.stats",
      "video.list",
    ]);
    const worker = read("worker/tiktok.ts");
    expect(worker).toContain('const scopes = ["user.info.basic", "user.info.profile", "user.info.stats", "video.list"]');
    expect(worker).toContain('app.get("/api/accounts/:id/monitor"');
  });
  it("builds safe public creator links without allowing injection", () => {
    expect(creatorProfileUrl("@byga.official")).toBe("https://www.tiktok.com/@byga.official");
    expect(() => creatorProfileUrl("@../../evil")).toThrow();
    expect(() => creatorProfileUrl("@bad?x=1")).toThrow();
  });
  it("provides a public creator embed and a profile link for blocked scripts", () => {
    const source = read("src/TikTokMonitoring.tsx");
    expect(source).toContain('data-embed-type');
    expect(source).toContain("https://www.tiktok.com/embed.js");
    expect(source).toContain("Buka {handle} di TikTok");
    expect(source).toContain("Mode A");
    const csp = read("public/_headers");
    expect(csp).toContain("frame-src https://www.tiktok.com;");
  });
});
