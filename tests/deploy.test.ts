import { afterEach, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const directories: string[] = [];
afterEach(() =>
  directories
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);
function deploy(extra: Record<string, string | undefined> = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "byga-deploy-"));
  directories.push(cwd);
  writeFileSync(join(cwd, "wrangler.jsonc"), readFileSync("wrangler.jsonc"));
  // No Cloudflare commands or credentials are used: this executable records calls.
  writeFileSync(
    join(cwd, "npx"),
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync('commands.jsonl', JSON.stringify(args) + '\\n');
if (args.includes('list')) console.log(JSON.stringify(JSON.parse(process.env.TEST_SECRET_NAMES).map(name => ({ name }))));
if (args.includes('--dry-run') && process.env.TEST_FAIL_DRY_RUN === 'true') process.exit(1);
`,
    { mode: 0o755 },
  );
  const result = spawnSync(process.execPath, [resolve("scripts/deploy.mjs")], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: cwd + delimiter + process.env.PATH,
      CLOUDFLARE_D1_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
      BYGA_APP_URL: "https://agency.test",
      TEST_SECRET_NAMES: JSON.stringify([
        "DASHBOARD_PASSWORD",
        "ENCRYPTION_KEY",
      ]),
      ...extra,
    },
  });
  let commands: string[][] = [];
  try {
    commands = readFileSync(join(cwd, "commands.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
  } catch {}
  return { ...result, commands };
}
it("refuses invalid production configuration before contacting Cloudflare", () => {
  for (const extra of [
    { CLOUDFLARE_D1_DATABASE_ID: "-".repeat(36) },
    { BYGA_APP_URL: "http://agency.test" },
    { BYGA_APP_URL: "https://agency.test/path" },
    { BYGA_APP_URL: "https://user:password@agency.test" },
  ]) {
    const result = deploy(extra);
    expect(result.status).not.toBe(0);
    expect(result.commands).toEqual([]);
  }
});
it("stops before migration when secrets are absent or the bundle fails validation", () => {
  const missing = deploy({ TEST_SECRET_NAMES: '["DASHBOARD_PASSWORD"]' });
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toContain("Missing Worker secret: ENCRYPTION_KEY");
  expect(missing.commands).toHaveLength(1);
  const invalid = deploy({ TEST_FAIL_DRY_RUN: "true" });
  expect(invalid.status).not.toBe(0);
  expect(invalid.commands).toHaveLength(2);
  expect(invalid.commands[1]).toContain("--dry-run");
});
it("validates secrets and bundle before migrating and deploying", () => {
  const result = deploy();
  expect(result.status, result.stderr).toBe(0);
  expect(result.commands.map((args) => args.slice(0, 3))).toEqual([
    ["wrangler", "secret", "list"],
    ["wrangler", "deploy", "--dry-run"],
    ["wrangler", "d1", "migrations"],
    ["wrangler", "deploy", "--config"],
  ]);
});
