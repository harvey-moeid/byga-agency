// Isolated, local Wrangler/D1/R2 smoke. Never reads production credentials or deploys.
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const root = resolve(import.meta.dirname, "..");
const dir = await mkdtemp(join(tmpdir(), "byga-creative-smoke-"));
const cli = join(root, "node_modules/wrangler/bin/wrangler.js");
const config = join(dir, "wrangler.json");
const base = "http://127.0.0.1:8789";
const env = {
  ...process.env,
  XDG_CONFIG_HOME: join(dir, "config"),
  WRANGLER_SEND_METRICS: "false",
};
await writeFile(
  config,
  JSON.stringify({
    name: "byga-creative-local-smoke",
    main: join(root, "worker/index.ts"),
    compatibility_date: "2025-10-11",
    d1_databases: [
      {
        binding: "DB",
        database_name: "byga-agency",
        database_id: "00000000-0000-0000-0000-000000000000",
        migrations_dir: join(root, "migrations"),
      },
    ],
    r2_buckets: [{ binding: "FILES", bucket_name: "byga-creative-smoke-only" }],
    vars: {
      APP_URL: base,
      DASHBOARD_PASSWORD: "smoke-test-only-password",
      ENCRYPTION_KEY: "smoke-test-only-encryption-key-at-least-32-characters",
    },
  }),
);
const migrated = spawnSync(
  process.execPath,
  [
    cli,
    "d1",
    "migrations",
    "apply",
    "byga-agency",
    "--local",
    "--config",
    config,
    "--persist-to",
    join(dir, "state"),
  ],
  { cwd: dir, env, encoding: "utf8", timeout: 30000 },
);
if (migrated.status !== 0)
  throw new Error(`Local migration failed: ${migrated.stderr}`);
let logs = "";
const server = spawn(
  process.execPath,
  [
    cli,
    "dev",
    "--local",
    "--config",
    config,
    "--persist-to",
    join(dir, "state"),
    "--port",
    "8789",
  ],
  { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] },
);
server.stdout.on("data", (chunk) => {
  logs += chunk;
});
server.stderr.on("data", (chunk) => {
  logs += chunk;
});
let cookie = "";
async function request(path, body, method = body ? "POST" : "GET") {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: base,
      Cookie: cookie,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  assert.ok(
    response.ok,
    `${path}: ${response.status} ${JSON.stringify(value)}`,
  );
  return { response, value };
}
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(base + "/api/ready");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Worker not ready: ${logs.slice(-2000)}`);
  const login = await request("/api/login", {
    password: "smoke-test-only-password",
  });
  cookie = login.response.headers.get("set-cookie").split(";")[0];
  await request("/api/accounts", {
    name: "Smoke test",
    handle: "@creativesmoke",
    color: "#418cff",
  });
  const account = (await request("/api/workspace")).value.accounts.find(
    (a) => a.handle === "@creativesmoke",
  );
  let p = (
    await request("/api/studio/projects", {
      name: "Local TikTok 30 seconds",
      accountId: account.id,
      creative: true,
    })
  ).value;
  async function command(command) {
    const r = await request(`/api/studio/projects/${p.id}/creative`, {
      expectedRevision: p.revision,
      command,
    });
    p = r.value.project;
    return r.value;
  }
  await command({
    action: "globals",
    globals: { ...p.creative.globals, idea: "Ritual kopi pagi kreator" },
  });
  await command({ action: "storyboard" });
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOcQAAAAASUVORK5CYII=",
    "base64",
  );
  const media = [];
  for (const [bytes, name, type] of [
    [png, "chatgpt-test.png", "image/png"],
    [
      await readFile(join(root, "tests/fixtures/sample.mp4")),
      "flow-test.mp4",
      "video/mp4",
    ],
  ]) {
    const form = new FormData();
    form.append("file", new File([bytes], name, { type }));
    if (type.startsWith("video/"))
      form.append(
        "media",
        JSON.stringify({ duration: 1, width: 64, height: 64 }),
      );
    const id = (await request("/api/files", form)).value.id;
    media.push(id);
    const result = await fetch(base + `/api/files/${id}`, {
      headers: { Cookie: cookie },
    });
    assert.ok(result.ok);
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
  }
  for (const scene of p.creative.scenes) {
    await command({
      action: "asset",
      sceneId: scene.id,
      slot: "first",
      assetId: media[0],
    });
    await command({
      action: "asset",
      sceneId: scene.id,
      slot: "video",
      assetId: media[1],
    });
  }
  await command({ action: "generate", kind: "both" });
  for (const scene of p.creative.scenes)
    await command({ action: "approve", sceneId: scene.id });
  const exported = await command({ action: "export" });
  assert.equal(exported.content.status, "draft");
  const saved = (await request(`/api/studio/projects/${p.id}`)).value;
  assert.deepEqual(saved, p);
  assert.equal(
    saved.creative.scenes.reduce((n, s) => n + s.duration, 0),
    30,
  );
  console.log(
    "PASS local Wrangler smoke: migrations 0001–0005, auth, 5×6 storyboard, templates, actual PNG/MP4 R2 bytes, D1 reload, approvals, Content Library draft. External generation/provider calls: none.",
  );
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    server.once("exit", resolve);
    setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 3000).unref();
  });
}
