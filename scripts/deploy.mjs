import { parse } from "jsonc-parser";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const id = process.env.CLOUDFLARE_D1_DATABASE_ID;
if (
  !id ||
  !/^[0-9a-f-]{36}$/i.test(id) ||
  id === "00000000-0000-0000-0000-000000000000"
)
  throw new Error(
    "Set CLOUDFLARE_D1_DATABASE_ID to your provisioned D1 database UUID.",
  );
const config = parse(await readFile("wrangler.jsonc", "utf8"));
config.d1_databases[0].database_id = id;
// Wrangler paths are relative to this generated config.
config.main = "../worker/index.ts";
config.assets.directory = "../dist";
config.d1_databases[0].migrations_dir = "../migrations";
if (process.env.BYGA_APP_URL) config.vars.APP_URL = process.env.BYGA_APP_URL;
if (process.env.BYGA_ENABLE_WORKERS_AI === "true")
  config.ai = { binding: "AI" };
await mkdir(".wrangler", { recursive: true });
await writeFile(".wrangler/deploy.json", JSON.stringify(config, null, 2));
for (const args of [
  [
    "d1",
    "migrations",
    "apply",
    "byga-agency",
    "--remote",
    "--config",
    ".wrangler/deploy.json",
  ],
  ["deploy", "--config", ".wrangler/deploy.json"],
]) {
  const result = spawnSync("npx", ["wrangler", ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
