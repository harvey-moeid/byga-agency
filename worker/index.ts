import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import {
  approve,
  schedule,
  revise,
  type Content,
  type Settings,
} from "../src/domain";
import { encrypt, decrypt, hash, constantEqual } from "./security";
import type { Env } from "./env";
import { credential, readSettings, log, content, save, deadline } from "./db";
import { notify, deliverNotifications } from "./notifications";
import { generate } from "./ai";
import {
  registerTikTokRoutes,
  creatorInfo,
  validatePublishOptions,
  publishOptionsSchema,
  IntegrationUnavailable,
} from "./tiktok";
import {
  registerPublishRoutes,
  enqueuePublish,
  cancelUnstartedJob,
  publishDue,
} from "./publishing";
import {
  registerResearchRoutes,
  syncCompetitors,
  syncWebTrends,
  dailyResearchReport,
} from "./research";
import { registerAnalyticsRoutes, syncAnalytics, recommend } from "./analytics";
const app = new Hono<{ Bindings: Env }>();
const settingsSchema = z.object({
  provider: z.enum(["openrouter", "cloudflare"]),
  model: z.string().min(1).max(120),
  retentionMonths: z.number().int().min(1).max(12),
  automaticDrafts: z.boolean(),
  notification: z.enum(["none", "discord", "telegram"]),
  researchEnabled: z.boolean().default(false),
  webTrendsEnabled: z.boolean().default(false),
  automaticRecommendations: z.boolean().default(false),
  timezone: z
    .enum(["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "UTC"])
    .default("Asia/Jakarta"),
  avatarAssetId: z.string().max(100).optional(),
});
const accountSchema = z.object({
  name: z.string().trim().min(1).max(60),
  handle: z.string().regex(/^@[A-Za-z0-9_.]{1,24}$/),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#809e79"),
});
const briefSchema = z.object({
  brief: z.string().trim().min(5).max(2000),
  accountId: z.string().min(1).max(100),
  researchIds: z.array(z.string().max(100)).max(10).default([]),
});
app.onError((err, c) => {
  console.error("API error", err.name);
  return c.json(
    { error: err instanceof z.ZodError ? "Input tidak valid." : err.message },
    err instanceof IntegrationUnavailable ? 503 : 400,
  );
});
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  if (!["GET", "HEAD"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (
      !origin ||
      (origin !== new URL(c.req.url).origin && origin !== c.env.APP_URL)
    )
      return c.json({ error: "Origin tidak diizinkan." }, 403);
  }
  if (c.req.path === "/api/health") {
    await next();
    return;
  }
  if (
    !c.env.DASHBOARD_PASSWORD ||
    c.env.DASHBOARD_PASSWORD.length < 12 ||
    !c.env.ENCRYPTION_KEY ||
    c.env.ENCRYPTION_KEY.length < 32
  )
    return c.json(
      {
        error:
          "Konfigurasikan DASHBOARD_PASSWORD dan ENCRYPTION_KEY di Worker secrets.",
      },
      503,
    );
  if (["/api/login", "/api/tiktok/callback"].includes(c.req.path)) {
    await next();
    return;
  }
  const token = getCookie(c, "byga_session");
  if (!token) return c.json({ error: "Silakan login." }, 401);
  const session = await c.env.DB.prepare(
    "SELECT expires_at FROM sessions WHERE token_hash=?",
  )
    .bind(await hash(token))
    .first<{ expires_at: number }>();
  if (!session || session.expires_at < Date.now())
    return c.json({ error: "Sesi kedaluwarsa." }, 401);
  await next();
});
app.use(
  "/api/files",
  bodyLimit({
    maxSize: 50 * 1024 * 1024 + 16384,
    onError: (c) => c.json({ error: "Maksimal 50 MB." }, 413),
  }),
);
app.use("/api/*", async (c, next) => {
  if (c.req.path !== "/api/files" && !["GET", "HEAD"].includes(c.req.method))
    return bodyLimit({
      maxSize: 65536,
      onError: (c) => c.json({ error: "Input terlalu besar." }, 413),
    })(c, next);
  await next();
});
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    mode: "live",
    publishingAvailable: true,
    researchAvailable: true,
    credentialsRequired: true,
  }),
);
app.post("/api/login", async (c) => {
  const { password } = z
    .object({ password: z.string().max(256) })
    .parse(await c.req.json());
  const ip = c.req.header("CF-Connecting-IP") || "local";
  const id = await hash(ip);
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at < ? THEN 1 ELSE attempts+1 END, expires_at=CASE WHEN expires_at < ? THEN excluded.expires_at ELSE expires_at END",
  )
    .bind(id, now + 900000, now, now)
    .run();
  const attempts = await c.env.DB.prepare(
    "SELECT attempts FROM login_attempts WHERE key=?",
  )
    .bind(id)
    .first<{ attempts: number }>();
  if (attempts!.attempts > 10)
    return c.json(
      { error: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." },
      429,
    );
  if (!(await constantEqual(password, c.env.DASHBOARD_PASSWORD)))
    return c.json({ error: "Password salah." }, 401);
  const token = crypto.randomUUID() + crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO sessions VALUES(?,?)")
    .bind(await hash(token), now + 86400000)
    .run();
  await c.env.DB.prepare("DELETE FROM login_attempts WHERE key=?")
    .bind(id)
    .run();
  setCookie(c, "byga_session", token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 86400,
  });
  return c.json({ ok: true });
});
app.post("/api/logout", async (c) => {
  const token = getCookie(c, "byga_session");
  if (token)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(token))
      .run();
  deleteCookie(c, "byga_session", { path: "/" });
  return c.json({ ok: true });
});
app.get("/api/workspace", async (c) => {
  const [accounts, contents, competitors, assets, activity, configured] =
    await Promise.all(
      [
        "accounts",
        "contents",
        "competitors",
        "files",
        "activity",
        "credentials",
      ].map((table) =>
        c.env.DB.prepare(
          `SELECT ${table === "credentials" ? "name" : "*"} FROM ${table}${table === "activity" ? " ORDER BY time DESC LIMIT 100" : ""}`,
        ).all(),
      ),
    );
  const settings = await readSettings(c.env);
  const [
    connections,
    publishJobs,
    trends,
    researchVideos,
    recommendations,
    history,
  ] = await Promise.all([
    c.env.DB.prepare(
      "SELECT account_id,nickname,scopes FROM oauth_connections",
    ).all(),
    c.env.DB.prepare(
      "SELECT id,content_id,account_id,status,attempts,next_at,publish_id,last_error,updated_at FROM publish_jobs ORDER BY updated_at DESC LIMIT 100",
    ).all(),
    c.env.DB.prepare(
      "SELECT data FROM trends ORDER BY fetched_at DESC LIMIT 40",
    ).all<{ data: string }>(),
    c.env.DB.prepare(
      "SELECT data FROM research_videos ORDER BY fetched_at DESC LIMIT 100",
    ).all<{ data: string }>(),
    c.env.DB.prepare("SELECT data FROM recommendations").all<{
      data: string;
    }>(),
    c.env.DB.prepare(
      "SELECT content_id,views,likes,recorded_at FROM analytics_history ORDER BY recorded_at DESC LIMIT 300",
    ).all(),
  ]);
  return c.json({
    accounts: accounts.results.map((x) => {
      const connection = connections.results.find((r) => r.account_id === x.id);
      return {
        ...x,
        connected: !!connection,
        nickname: connection?.nickname,
        scopes: connection ? String(connection.scopes).split(",") : [],
      };
    }),
    contents: contents.results.map((x) => JSON.parse(x.data as string)),
    competitors: competitors.results,
    assets: assets.results.map((x) => ({
      ...x,
      createdAt: x.created_at,
      media: x.media ? JSON.parse(String(x.media)) : undefined,
    })),
    activity: activity.results,
    publishJobs: publishJobs.results,
    trends: trends.results.map((x) => JSON.parse(x.data)),
    researchVideos: researchVideos.results.map((x) => JSON.parse(x.data)),
    recommendations: recommendations.results.map((x) => JSON.parse(x.data)),
    analyticsHistory: history.results.map((x) => ({
      contentId: x.content_id,
      views: x.views,
      likes: x.likes,
      recordedAt: x.recorded_at,
    })),
    settings: {
      ...settings,
      configured: configured.results.map((x) => x.name),
    },
  });
});
app.post("/api/accounts", async (c) => {
  const a = accountSchema.parse(await c.req.json());
  await c.env.DB.prepare("INSERT INTO accounts VALUES(?,?,?,?,0)")
    .bind(crypto.randomUUID(), a.name, a.handle, a.color)
    .run();
  return c.json({ ok: true });
});
app.delete("/api/accounts/:id", async (c) => {
  const used = await c.env.DB.prepare(
    "SELECT id FROM contents WHERE account_id=? LIMIT 1",
  )
    .bind(c.req.param("id"))
    .first();
  if (used)
    return c.json(
      { error: "Akun memiliki konten dan belum dapat dihapus." },
      409,
    );
  await c.env.DB.prepare("DELETE FROM accounts WHERE id=?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});
app.post("/api/competitors", async (c) => {
  const a = z
    .object({
      handle: accountSchema.shape.handle,
      category: z.string().trim().max(80).default("Inspirasi"),
    })
    .parse(await c.req.json());
  await c.env.DB.prepare(
    "INSERT INTO competitors(id,handle,category) VALUES(?,?,?)",
  )
    .bind(crypto.randomUUID(), a.handle, a.category)
    .run();
  return c.json({ ok: true });
});
app.delete("/api/competitors/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM competitors WHERE id=?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});
app.post("/api/contents/generate", async (c) => {
  const b = briefSchema.parse(await c.req.json());
  return c.json(await generate(c.env, b.brief, b.accountId, b.researchIds));
});
app.patch("/api/contents/:id", async (c) => {
  const old = await content(c.env, c.req.param("id"));
  if (!["draft", "review"].includes(old.status))
    throw new Error("Konten yang disetujui tidak bisa diedit.");
  const edits = z
    .object({
      title: z.string().min(1).max(200),
      caption: z.string().max(2200),
      prompt: z.string().max(8000),
    })
    .parse(await c.req.json());
  await save(c.env, { ...old, ...edits }, old.status);
  return c.json({ ok: true });
});
app.delete("/api/contents/:id", async (c) => {
  const item = await content(c.env, c.req.param("id"));
  if (!["draft", "review", "failed"].includes(item.status))
    throw new Error("Kembalikan ke draft sebelum menghapus konten.");
  await cancelUnstartedJob(c.env, item.id);
  await c.env.DB.prepare("DELETE FROM contents WHERE id=? AND status=?")
    .bind(item.id, item.status)
    .run();
  return c.json({ ok: true });
});
app.post("/api/contents/:id/transition", async (c) => {
  const { action, date, fileId, publishOptions } = z
    .object({
      action: z.enum(["review", "approve", "schedule", "publish", "revise"]),
      date: z.string().optional(),
      fileId: z.string().optional(),
      publishOptions: publishOptionsSchema.optional(),
    })
    .parse(await c.req.json());
  const old = await content(c.env, c.req.param("id"));
  let next = old;
  if (action === "review") {
    if (old.status !== "draft")
      throw new Error("Hanya draft dapat dikirim untuk review.");
    if (
      !fileId ||
      !(await c.env.DB.prepare("SELECT id FROM files WHERE id=?")
        .bind(fileId)
        .first())
    )
      throw new Error("Upload video dahulu.");
    next = { ...old, fileId, status: "review" };
  }
  if (action === "revise") {
    await cancelUnstartedJob(c.env, old.id);
    next = revise(old);
  }
  if (action === "approve") {
    next = approve(old);
    if (publishOptions) {
      const info = await creatorInfo(c.env, old.accountId);
      const file = await c.env.DB.prepare("SELECT media FROM files WHERE id=?")
        .bind(old.fileId)
        .first<{ media: string | null }>();
      if (!file?.media)
        throw new Error("Upload ulang video untuk metadata durasi.");
      validatePublishOptions(
        publishOptions,
        info,
        JSON.parse(file.media).duration,
      );
      next.publishOptions = publishOptions;
      const identity = await c.env.DB.prepare(
        "SELECT open_id FROM oauth_connections WHERE account_id=?",
      )
        .bind(old.accountId)
        .first<{ open_id: string }>();
      if (!identity)
        throw new IntegrationUnavailable(
          "Hubungkan akun sebelum final approval.",
        );
      next.approvedCreatorId = identity.open_id;
    }
  }
  if (action === "schedule") next = schedule(old, date || "");
  if (action === "publish") {
    // Check consent and creator limits before a manual queue request; no social API init here.
    if (!old.publishOptions)
      throw new IntegrationUnavailable(
        "Hubungkan akun dan approve ulang dengan privasi serta consent TikTok.",
      );
    const info = await creatorInfo(c.env, old.accountId);
    const file = await c.env.DB.prepare("SELECT media FROM files WHERE id=?")
      .bind(old.fileId)
      .first<{ media: string | null }>();
    if (!file?.media) throw new Error("Metadata video belum tersedia.");
    validatePublishOptions(
      old.publishOptions,
      info,
      JSON.parse(file.media).duration,
    );
    await enqueuePublish(c.env, old);
    await log(
      c.env,
      "publish",
      "Konten masuk antrean publish yang telah disetujui.",
    );
    return c.json(old);
  }
  if (action === "schedule") await cancelUnstartedJob(c.env, old.id);
  await save(c.env, next, old.status);
  await log(
    c.env,
    action === "schedule" ? "schedule" : "content",
    `${old.title}: ${next.status}`,
  );
  if (action === "review")
    try {
      const a = await c.env.DB.prepare("SELECT name FROM accounts WHERE id=?")
        .bind(old.accountId)
        .first<{ name: string }>();
      await notify(c.env, `${a?.name || "Akun"}: konten siap di-approve`);
    } catch {
      await log(
        c.env,
        "content",
        "Konten tersimpan; pengiriman notifikasi gagal.",
      );
    }
  return c.json(next);
});
app.post("/api/files", async (c) => {
  const size = Number(c.req.header("Content-Length"));
  if (size > 50 * 1024 * 1024) return c.json({ error: "Maksimal 50 MB." }, 413);
  const form = await c.req.formData();
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 50 * 1024 * 1024
  )
    throw new Error("Pilih file valid, maksimal 50 MB.");
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mp4 = new TextDecoder().decode(bytes.slice(4, 8)) === "ftyp",
    webm =
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3,
    glb = new TextDecoder().decode(bytes.slice(0, 4)) === "glTF";
  if (!mp4 && !webm && !glb)
    throw new Error("Format harus MP4, WebM, atau GLB.");
  if (glb) {
    if (file.size > 10 * 1024 * 1024)
      throw new Error("Aset GLB maksimal 10 MB.");
    const data = new DataView(await file.arrayBuffer());
    if (
      data.getUint32(4, true) !== 2 ||
      data.getUint32(8, true) !== file.size ||
      data.getUint32(16, true) !== 0x4e4f534a
    )
      throw new Error("GLB tidak valid.");
    const json = JSON.parse(
      new TextDecoder().decode(
        data.buffer.slice(20, 20 + data.getUint32(12, true)),
      ),
    );
    if (
      [...(json.buffers || []), ...(json.images || [])].some(
        (x: { uri?: string }) => x.uri && !x.uri.startsWith("data:"),
      )
    )
      throw new Error("Gunakan GLB dengan tekstur/buffer embedded.");
  }
  const mime = glb ? "model/gltf-binary" : mp4 ? "video/mp4" : "video/webm";
  const mediaValue = form.get("media");
  const media =
    !glb && typeof mediaValue === "string"
      ? z
          .object({
            duration: z.number().positive().max(3600),
            width: z.number().int().positive().max(8192),
            height: z.number().int().positive().max(8192),
          })
          .parse(JSON.parse(mediaValue))
      : null;
  const id = crypto.randomUUID();
  await c.env.FILES.put(id, file.stream(), {
    httpMetadata: { contentType: mime },
  });
  try {
    await c.env.DB.prepare(
      "INSERT INTO files(id,name,size,type,created_at,media) VALUES(?,?,?,?,?,?)",
    )
      .bind(
        id,
        file.name,
        file.size,
        mime,
        new Date().toISOString(),
        media ? JSON.stringify(media) : null,
      )
      .run();
  } catch (e) {
    await c.env.FILES.delete(id);
    throw e;
  }
  return c.json({ id });
});
app.get("/api/files/:id", async (c) => {
  const range = c.req.header("Range");
  const file = await c.env.FILES.get(
    c.req.param("id"),
    range ? { range: c.req.raw.headers } : undefined,
  );
  if (!file) return c.notFound();
  const headers = new Headers({
    "Content-Type":
      file.httpMetadata?.contentType || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  });
  if (range && file.range && "offset" in file.range) {
    const offset = file.range.offset || 0,
      length = file.range.length || file.size;
    headers.set(
      "Content-Range",
      `bytes ${offset}-${offset + length - 1}/${file.size}`,
    );
    headers.set("Content-Length", String(length));
    return new Response(file.body, { status: 206, headers });
  }
  return new Response(file.body, { headers });
});
app.delete("/api/files/:id", async (c) => {
  const id = c.req.param("id");
  const rows = await c.env.DB.prepare("SELECT data FROM contents").all<{
    data: string;
  }>();
  if (rows.results.some((x) => JSON.parse(x.data).fileId === id))
    return c.json(
      { error: "File digunakan konten. Tidak dapat dihapus." },
      409,
    );
  if ((await readSettings(c.env)).avatarAssetId === id)
    throw new Error(
      "Aset avatar aktif tidak dapat dihapus. Ganti avatar di Settings.",
    );
  const row = await c.env.DB.prepare("SELECT * FROM files WHERE id=?")
    .bind(id)
    .first();
  if (!row) return c.notFound();
  await c.env.DB.prepare("DELETE FROM files WHERE id=?").bind(id).run();
  try {
    await c.env.FILES.delete(id);
  } catch {
    await c.env.DB.prepare(
      "INSERT INTO files(id,name,size,type,created_at,media) VALUES(?,?,?,?,?,?)",
    )
      .bind(row.id, row.name, row.size, row.type, row.created_at, row.media)
      .run();
    throw new Error("Penghapusan R2 gagal; metadata file dikembalikan.");
  }
  return c.json({ ok: true });
});
app.put("/api/settings", async (c) => {
  const body = await c.req.json();
  const settings = settingsSchema.parse(body);
  const keys = z
    .object({
      openrouterKey: z.string().max(500).optional(),
      tiktokClientKey: z.string().min(1).max(500).optional(),
      tiktokClientSecret: z.string().min(1).max(1000).optional(),
      researchClientKey: z.string().min(1).max(500).optional(),
      researchClientSecret: z.string().min(1).max(1000).optional(),
      discordWebhook: z.url().optional(),
      telegramToken: z
        .string()
        .regex(/^[0-9]+:[A-Za-z0-9_-]+$/)
        .optional(),
      telegramChatId: z
        .string()
        .regex(/^-?[0-9]+$/)
        .optional(),
    })
    .parse(body.keys || {});
  if (keys.discordWebhook) {
    const u = new URL(keys.discordWebhook);
    if (
      u.protocol !== "https:" ||
      !["discord.com", "discordapp.com"].includes(u.hostname) ||
      !/^\/api\/webhooks\/\d+\/[\w-]+$/.test(u.pathname)
    )
      throw new Error("Gunakan URL webhook Discord resmi.");
  }
  if (
    settings.avatarAssetId &&
    !(await c.env.DB.prepare(
      "SELECT id FROM files WHERE id=? AND type='model/gltf-binary'",
    )
      .bind(settings.avatarAssetId)
      .first())
  )
    throw new Error("Pilih file GLB yang tersimpan.");
  const statements = [
    c.env.DB.prepare("UPDATE settings SET data=? WHERE id=1").bind(
      JSON.stringify(settings),
    ),
  ];
  for (const [name, value] of Object.entries(keys))
    if (value)
      statements.push(
        c.env.DB.prepare(
          "INSERT INTO credentials VALUES(?,?) ON CONFLICT(name) DO UPDATE SET encrypted=excluded.encrypted",
        ).bind(name, await encrypt(value, c.env.ENCRYPTION_KEY)),
      );
  if (keys.researchClientKey || keys.researchClientSecret)
    statements.push(
      c.env.DB.prepare(
        "DELETE FROM credentials WHERE name='researchTokenCache'",
      ),
    );
  await c.env.DB.batch(statements);
  return c.json({ ok: true });
});
registerTikTokRoutes(app);
registerPublishRoutes(app);
registerResearchRoutes(app);
registerAnalyticsRoutes(app);
app.notFound((c) => c.json({ error: "Endpoint tidak ditemukan." }, 404));
async function jobs(env: Env, cron: string) {
  const now = Date.now();
  const expiresAt = now + 600000;
  const lock = await env.DB.prepare(
    "INSERT INTO job_locks VALUES(?,?) ON CONFLICT(name) DO UPDATE SET expires_at=excluded.expires_at WHERE job_locks.expires_at < ?",
  )
    .bind(cron, expiresAt, now)
    .run();
  if (!lock.meta.changes) return;
  try {
    if (cron === "*/5 * * * *") {
      await publishDue(env);
      await deliverNotifications(env);
    }
    if (cron === "0 * * * *") {
      try {
        await syncCompetitors(env);
      } catch {
        await log(
          env,
          "research",
          "Riset perlu diperiksa: akses/credential Research API belum tersedia.",
        );
      }
      await syncAnalytics(env);
    }
    if (cron === "0 1 * * *") {
      const settings = await readSettings(env);
      const cutoff = deadline(settings.retentionMonths);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM activity WHERE time < ?").bind(cutoff),
        env.DB.prepare("DELETE FROM research_videos WHERE fetched_at < ?").bind(
          cutoff,
        ),
        env.DB.prepare("DELETE FROM trends WHERE fetched_at < ?").bind(cutoff),
        env.DB.prepare(
          "DELETE FROM research_reports WHERE created_at < ?",
        ).bind(cutoff),
        env.DB.prepare(
          "DELETE FROM analytics_history WHERE recorded_at < ?",
        ).bind(cutoff),
        env.DB.prepare("DELETE FROM recommendations WHERE created_at < ?").bind(
          cutoff,
        ),
        env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < ?").bind(
          now,
        ),
        env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
        env.DB.prepare("DELETE FROM login_attempts WHERE expires_at < ?").bind(
          now,
        ),
        env.DB.prepare(
          "DELETE FROM notification_jobs WHERE created_at < ? AND status!='ready'",
        ).bind(cutoff),
      ]);
      try {
        await syncWebTrends(env);
      } catch {
        await log(env, "research", "Google Trends belum dapat diperbarui.");
      }
      await dailyResearchReport(env);
      const accounts = await env.DB.prepare(
        "SELECT id,name FROM accounts ORDER BY id LIMIT 5",
      ).all<{ id: string; name: string }>();
      const refs = await env.DB.prepare(
        "SELECT id,title FROM trends ORDER BY fetched_at DESC LIMIT 3",
      ).all<{ id: string; title: string }>();
      for (const account of accounts.results) {
        if (settings.automaticDrafts)
          try {
            await generate(
              env,
              refs.results.length
                ? `Inspirasi untuk ${account.name}: ${refs.results.map((x) => x.title).join(", ")}`
                : `Ide evergreen untuk ${account.name}. Jangan mengklaim tren terkini.`,
              account.id,
              refs.results.map((x) => x.id),
            );
          } catch {
            await log(
              env,
              "content",
              `Generate otomatis untuk ${account.name} gagal. Periksa provider.`,
            );
          }
        if (settings.automaticRecommendations)
          try {
            await recommend(env, account.id);
          } catch {
            await log(
              env,
              "analytics",
              `Rekomendasi untuk ${account.name} belum tersedia.`,
            );
          }
      }
    }
  } finally {
    await env.DB.prepare("DELETE FROM job_locks WHERE name=? AND expires_at=?")
      .bind(cron, expiresAt)
      .run();
  }
}
export { app, jobs };
export default {
  fetch: app.fetch,
  scheduled: (event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(jobs(env, event.cron));
    // Share the five-minute trigger with hourly tasks to save a cron slot.
    // Use scheduledTime so delayed delivery still runs the intended hour.
    if (
      event.cron === "*/5 * * * *" &&
      new Date(event.scheduledTime).getUTCMinutes() === 0
    )
      ctx.waitUntil(jobs(env, "0 * * * *"));
  },
};
