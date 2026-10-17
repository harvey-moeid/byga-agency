import { afterAll, beforeAll, expect, it } from "vitest";
import { Miniflare, type MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";

let mf: Miniflare;
let options: MiniflareOptions;
beforeAll(async () => {
  const bundle = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    mainFields: ["browser", "module", "main"],
  });
  options = {
    modules: true,
    script: bundle.outputFiles[0].text,
    compatibilityDate: "2025-10-11",
    d1Databases: ["DB"],
    r2Buckets: ["FILES"],
    bindings: {
      DASHBOARD_PASSWORD: "readiness-test-password",
      ENCRYPTION_KEY: "readiness-test-key-with-at-least-32-characters",
      APP_URL: "https://agency.test",
    },
  };
  mf = new Miniflare(options);
}, 30000);
afterAll(async () => mf?.dispose());

it("keeps liveness separate from readiness and requires every migration", async () => {
  const health = await mf.dispatchFetch("https://agency.test/api/health");
  expect(health.status).toBe(200);
  const empty = await mf.dispatchFetch("https://agency.test/api/ready");
  expect(empty.status).toBe(503);
  expect(await empty.json()).toEqual({ ok: false });
  expect(empty.headers.get("cache-control")).toBe("no-store");
  const db = await mf.getD1Database("DB");
  const migrations = (await readdir("migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrations) {
    for (const sql of (await readFile(`migrations/${name}`, "utf8"))
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
    const ready = await mf.dispatchFetch("https://agency.test/api/ready");
    expect(ready.status).toBe(name === migrations.at(-1) ? 200 : 503);
    expect(await ready.json()).toEqual({ ok: name === migrations.at(-1) });
  }
  const settings = await db
    .prepare("SELECT data FROM settings WHERE id=1")
    .first<{ data: string }>();
  await db.prepare("UPDATE settings SET data='{}' WHERE id=1").run();
  expect((await mf.dispatchFetch("https://agency.test/api/ready")).status).toBe(
    503,
  );
  await db
    .prepare("UPDATE settings SET data=? WHERE id=1")
    .bind(settings!.data)
    .run();
});

it("reports unavailable secrets or storage without leaking internal errors", async () => {
  for (const bindings of [
    { ...options.bindings, DASHBOARD_PASSWORD: "short" },
    { ...options.bindings, ENCRYPTION_KEY: "short" },
  ]) {
    await mf.setOptions({ ...options, bindings });
    const response = await mf.dispatchFetch("https://agency.test/api/ready");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  }
  await mf.setOptions({ ...options, r2Buckets: [] });
  const response = await mf.dispatchFetch("https://agency.test/api/ready");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ ok: false });
});
