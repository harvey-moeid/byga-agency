import { parse } from "jsonc-parser";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const id = process.env.CLOUDFLARE_D1_DATABASE_ID;
if (
  !id ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
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
const appUrl = new URL(config.vars.APP_URL);
if (
  appUrl.protocol !== "https:" ||
  appUrl.username ||
  appUrl.password ||
  appUrl.origin !== config.vars.APP_URL
)
  throw new Error(
    "BYGA_APP_URL must be an HTTPS origin without a path or credentials.",
  );
if (process.env.BYGA_ENABLE_WORKERS_AI === "true")
  config.ai = { binding: "AI" };
await mkdir(".wrangler", { recursive: true });
await writeFile(".wrangler/deploy.json", JSON.stringify(config, null, 2));
// Fail before migrating the database if required Worker secrets are absent.
const secrets = spawnSync(
  "npx",
  [
    "wrangler",
    "secret",
    "list",
    "--format",
    "json",
    "--config",
    ".wrangler/deploy.json",
  ],
  { encoding: "utf8", env: process.env },
);
if (secrets.status !== 0)
  throw new Error(
    "Cannot verify Worker secrets. Provision the Worker and its secrets before deploying.",
  );
const names = new Set(JSON.parse(secrets.stdout).map((secret) => secret.name));
for (const name of ["DASHBOARD_PASSWORD", "ENCRYPTION_KEY"])
  if (!names.has(name)) throw new Error(`Missing Worker secret: ${name}`);
for (const args of [
  ["deploy", "--dry-run", "--config", ".wrangler/deploy.json"],
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
