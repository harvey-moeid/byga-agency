import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const base = process.env.BYGA_SMOKE_BASE_URL || "http://127.0.0.1:8787";
const password =
  process.env.BYGA_SMOKE_PASSWORD ||
  (await readFile(".dev.vars", "utf8")).match(
    /^DASHBOARD_PASSWORD="([^"]+)"/m,
  )?.[1];
if (!password)
  throw new Error("Local .dev.vars required; values are never logged.");
let cookie = "";
async function request(
  path,
  body,
  method = body ? "POST" : "GET",
  origin = base,
) {
  const response = await fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return response;
}
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
function sql(file) {
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "byga-agency",
      "--local",
      "--file",
      file,
      ...(process.env.BYGA_SMOKE_CONFIG
        ? ["--config", process.env.BYGA_SMOKE_CONFIG]
        : []),
      ...(process.env.BYGA_SMOKE_PERSIST_TO
        ? ["--persist-to", process.env.BYGA_SMOKE_PERSIST_TO]
        : []),
    ],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: "false",
        XDG_CONFIG_HOME: "/workspace/.config",
        WRANGLER_LOG_PATH: "/workspace/byga-agency/.wrangler/logs",
      },
    },
  );
}
const id = "smoke-" + crypto.randomUUID();
let accountId, fileId;
try {
  assert.equal((await request("/workspace")).status, 401);
  assert.equal(
    (await request("/login", { password }, "POST", "https://evil.example"))
      .status,
    403,
  );
  assert.equal(
    (await request("/login", { password: "intentionally-wrong" })).status,
    401,
  );
  const login = await request("/login", { password });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  cookie = setCookie.split(";")[0];
  assert.equal(
    (
      await request("/accounts", {
        name: "Smoke account",
        handle: "@smoke" + id.slice(-10),
        color: "#809e79",
      })
    ).status,
    200,
  );
  let workspace = await (await request("/workspace")).json();
  accountId = workspace.accounts.find(
    (a) => a.handle === "@smoke" + id.slice(-10),
  ).id;
  const initial = {
    id,
    accountId,
    title: "Local validation",
    caption: "Caption",
    prompt: "Vertical 9:16",
    status: "draft",
    createdAt: new Date().toISOString(),
    views: 0,
    likes: 0,
  };
  await writeFile(
    ".wrangler/smoke-seed.sql",
    `INSERT INTO contents VALUES(${[id, accountId, JSON.stringify(initial), "draft", null, initial.createdAt, null].map((v) => (v === null ? "NULL" : q(v))).join(",")});`,
  );
  sql(".wrangler/smoke-seed.sql");
  assert.equal(
    (await request(`/contents/${id}/transition`, { action: "approve" })).status,
    400,
  );
  assert.equal(
    (
      await request(`/contents/${id}/transition`, {
        action: "schedule",
        date: "2030-01-01T00:00:00Z",
      })
    ).status,
    400,
  );
  const form = new FormData();
  form.append(
    "file",
    new File([await readFile("tests/fixtures/sample.mp4")], "sample.mp4", {
      type: "video/mp4",
    }),
  );
  const upload = await request("/files", form);
  assert.equal(upload.status, 200);
  fileId = (await upload.json()).id;
  const download = await request("/files/" + fileId);
  assert.equal(download.status, 200);
  assert.equal(
    (await download.arrayBuffer()).byteLength,
    (await readFile("tests/fixtures/sample.mp4")).byteLength,
  );
  const partial = await fetch(base + "/api/files/" + fileId, {
    headers: { Cookie: cookie, Range: "bytes=0-15" },
  });
  assert.equal(partial.status, 206);
  assert.equal((await partial.arrayBuffer()).byteLength, 16);
  assert.equal(
    (await request(`/contents/${id}/transition`, { action: "review", fileId }))
      .status,
    200,
  );
  assert.equal(
    (await request("/files/" + fileId, undefined, "DELETE")).status,
    409,
  );
  assert.equal(
    (await request(`/contents/${id}/transition`, { action: "approve" })).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/contents/${id}`,
        { title: "Mutated", caption: "no", prompt: "no" },
        "PATCH",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/contents/${id}/transition`, {
        action: "schedule",
        date: "2030-01-01T00:00:00Z",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/contents/${id}/transition`, { action: "publish" })).status,
    503,
  );
  workspace = await (await request("/workspace")).json();
  assert.equal(workspace.contents.find((c) => c.id === id).status, "scheduled");
  // A due job must fail honestly, never pretend to have posted to TikTok.
  const due = {
    ...initial,
    fileId,
    status: "scheduled",
    scheduledAt: new Date(Date.now() - 1000).toISOString(),
  };
  await writeFile(
    ".wrangler/smoke-due.sql",
    `UPDATE contents SET data=${q(JSON.stringify(due))}, scheduled_at=${q(due.scheduledAt)} WHERE id=${q(id)};`,
  );
  sql(".wrangler/smoke-due.sql");
  const trigger = await fetch(
    base + "/__scheduled?cron=" + encodeURIComponent("*/5 * * * *"),
  );
  assert.equal(trigger.status, 200);
  for (let i = 0; i < 20; i++) {
    workspace = await (await request("/workspace")).json();
    if (
      workspace.publishJobs.find((j) => j.content_id === id)?.status ===
      "blocked"
    )
      break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(workspace.contents.find((c) => c.id === id).status, "scheduled");
  assert.equal(
    workspace.publishJobs.find((j) => j.content_id === id).status,
    "blocked",
  );
  await writeFile(
    ".wrangler/smoke-cleanup.sql",
    `DELETE FROM contents WHERE id=${q(id)}; DELETE FROM accounts WHERE id=${q(accountId)};`,
  );
  sql(".wrangler/smoke-cleanup.sql");
  accountId = undefined;
  assert.equal(
    (await request("/files/" + fileId, undefined, "DELETE")).status,
    200,
  );
  fileId = undefined;
  assert.equal((await request("/logout", {})).status, 200);
  assert.equal((await request("/workspace")).status, 401);
  console.log(
    "PASS: local D1/R2, auth, CSRF, byte-range video, approval, scheduling, edit protection, publish blocking, due cron, logout.",
  );
} finally {
  if (accountId) {
    await writeFile(
      ".wrangler/smoke-cleanup.sql",
      `DELETE FROM contents WHERE id=${q(id)};DELETE FROM accounts WHERE id=${q(accountId)};`,
    );
    sql(".wrangler/smoke-cleanup.sql");
  }
  if (fileId) await request("/files/" + fileId, undefined, "DELETE");
}
