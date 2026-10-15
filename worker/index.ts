import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { registerStudioRoutes } from "./studio";
import { StudioConflict } from "../src/studio";
import { aiProviderIds } from "../src/aiProviders";
import {
  approve,
  schedule,
  revise,
  type Content,
  type Settings,
} from "../src/domain";
import { encrypt, decrypt, hash, constantEqual } from "./security";
import type { Env } from "./env";
import {
  credential,
  readSettings,
  log,
  content,
  save,
  deadline,
  checkRevision,
  deleteContent,
  ContentConflict,
} from "./db";
import { notify, deliverNotifications } from "./notifications";
import { generate, generateUGC } from "./ai";
import { ugcBriefSchema } from "../src/ugc";
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
  provider: z.enum(aiProviderIds),
  model: z.string().trim().min(1).max(120),
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
    err instanceof IntegrationUnavailable
      ? 503
      : err instanceof ContentConflict || err instanceof StudioConflict
        ? 409
        : 400,
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
    "SELECT id FROM contents WHERE account_id=? UNION ALL SELECT id FROM studio_projects WHERE account_id=? LIMIT 1",
  )
    .bind(c.req.param("id"), c.req.param("id"))
    .first();
  if (used)
    return c.json(
      { error: "Akun memiliki konten atau proyek dan belum dapat dihapus." },
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
app.post("/api/contents/generate-ugc", async (c) => {
  const body = z
    .object({
      accountId: z.string().min(1).max(100),
      brief: ugcBriefSchema,
    })
    .parse(await c.req.json());
  return c.json(await generateUGC(c.env, body.accountId, body.brief));
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
      expectedRevision: z.number().int().nonnegative().optional(),
    })
    .parse(await c.req.json());
  const { expectedRevision, ...fields } = edits;
  checkRevision(old, expectedRevision);
  const next = { ...old, ...fields };
  await save(c.env, next, old);
  return c.json(next);
});
app.delete("/api/contents/:id", async (c) => {
  const item = await content(c.env, c.req.param("id"));
  if (!["draft", "review", "failed"].includes(item.status))
    throw new Error("Kembalikan ke draft sebelum menghapus konten.");
  await deleteContent(c.env, item);
  return c.json({ ok: true });
});
app.post("/api/contents/:id/transition", async (c) => {
  const { action, date, fileId, publishOptions, expectedRevision } = z
    .object({
      action: z.enum(["review", "approve", "schedule", "publish", "revise"]),
      date: z.string().optional(),
      fileId: z.string().optional(),
      publishOptions: publishOptionsSchema.optional(),
      expectedRevision: z.number().int().nonnegative().optional(),
    })
    .parse(await c.req.json());
  const old = await content(c.env, c.req.param("id"));
  checkRevision(old, expectedRevision);
  let next = old;
  if (action === "review") {
    if (old.status !== "draft")
      throw new Error("Hanya draft dapat dikirim untuk review.");
    if (
      !fileId ||
      !(await c.env.DB.prepare(
        "SELECT id FROM files WHERE id=? AND type IN ('video/mp4','video/webm')",
      )
        .bind(fileId)
        .first())
    )
      throw new Error("Upload video MP4 atau WebM dahulu.");
    next = { ...old, fileId, status: "review" };
  }
  if (action === "revise") {
    next = revise(old);
  }
  if (action === "approve") {
    next = approve(old);
    if (publishOptions) {
      if (expectedRevision === undefined || !publishOptions.creatorId)
        throw new ContentConflict();
      const info = await creatorInfo(
        c.env,
        old.accountId,
        publishOptions.creatorId,
      );
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
      if (!identity || identity.open_id !== info.creatorId)
        throw new IntegrationUnavailable(
          "Hubungkan akun sebelum final approval.",
        );
      next.approvedCreatorId = info.creatorId;
    }
  }
  if (action === "schedule") next = schedule(old, date || "");
  if (action === "publish") {
    // Check consent and creator limits before a manual queue request; no social API init here.
    if (!old.publishOptions)
      throw new IntegrationUnavailable(
        "Hubungkan akun dan approve ulang dengan privasi serta consent TikTok.",
      );
    const info = await creatorInfo(c.env, old.accountId, old.approvedCreatorId);
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
  await save(c.env, next, old, action === "schedule" || action === "revise");
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
  if (size > 50 * 1024 * 1024 + 16384)
    return c.json({ error: "Maksimal 50 MB." }, 413);
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
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const imageWebp =
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  const image = png || jpeg || imageWebp;
  if (image && file.size > 5 * 1024 * 1024)
    throw new Error("Gambar referensi maksimal 5 MB.");
  if (!mp4 && !webm && !glb && !image)
    throw new Error("Format harus MP4, WebM, GLB, PNG, JPG, atau WebP.");
  if (glb) {
    if (file.size < 20) throw new Error("GLB tidak valid.");
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
  const mime = png
    ? "image/png"
    : jpeg
      ? "image/jpeg"
      : imageWebp
        ? "image/webp"
        : glb
          ? "model/gltf-binary"
          : mp4
            ? "video/mp4"
            : "video/webm";
  const mediaValue = form.get("media");
  const media =
    !glb && !image && typeof mediaValue === "string"
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
  let selection: { offset: number; length: number } | undefined;
  if (range) {
    const metadata = await c.env.FILES.head(c.req.param("id"));
    if (!metadata) return c.notFound();
    const parts = /^bytes=(\d*)-(\d*)$/.exec(range);
    const start = parts?.[1] ? Number(parts[1]) : undefined;
    const end = parts?.[2] ? Number(parts[2]) : undefined;
    const offset = start ?? Math.max(0, metadata.size - (end ?? 0));
    const last =
      start === undefined
        ? metadata.size - 1
        : Math.min(end ?? metadata.size - 1, metadata.size - 1);
    if (
      !parts ||
      (!parts[1] && !parts[2]) ||
      !Number.isSafeInteger(offset) ||
      (end !== undefined && !Number.isSafeInteger(end)) ||
      offset < 0 ||
      offset >= metadata.size ||
      last < offset
    )
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${metadata.size}`,
          "Cache-Control": "private, no-store",
          "Accept-Ranges": "bytes",
        },
      });
    selection = { offset, length: last - offset + 1 };
  }
  const file = await c.env.FILES.get(
    c.req.param("id"),
    selection ? { range: selection } : undefined,
  );
  if (!file) return c.notFound();
  const headers = new Headers({
    "Content-Type":
      file.httpMetadata?.contentType || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  });
  if (selection) {
    const { offset, length } = selection;
    headers.set(
      "Content-Range",
      `bytes ${offset}-${offset + length - 1}/${file.size}`,
    );
    headers.set("Content-Length", String(length));
    return new Response(file.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(file.size));
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
  const [characterRef, projectRef] = await Promise.all([
    c.env.DB.prepare(
      "SELECT id FROM studio_characters WHERE json_extract(data,'$.referenceAssetId')=? LIMIT 1",
    )
      .bind(id)
      .first(),
    c.env.DB.prepare(
      "SELECT id FROM studio_projects WHERE json_extract(data,'$.briefDraft.characterProfile.referenceAssetId')=? OR json_extract(data,'$.brief.data.characterProfile.referenceAssetId')=? OR EXISTS(SELECT 1 FROM json_each(json_extract(studio_projects.data,'$.history')) AS h WHERE json_extract(h.value,'$.payload.stage')='brief' AND json_extract(h.value,'$.payload.data.characterProfile.referenceAssetId')=?) LIMIT 1",
    )
      .bind(id, id, id)
      .first(),
  ]);
  if (characterRef || projectRef)
    return c.json(
      {
        error:
          "Gambar digunakan profil karakter atau riwayat proyek. Tidak dapat dihapus.",
      },
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
      geminiKey: z.string().trim().max(500).optional(),
      nvidiaKey: z.string().trim().max(500).optional(),
      cohereKey: z.string().trim().max(500).optional(),
      huggingfaceKey: z.string().trim().max(500).optional(),
      mistralKey: z.string().trim().max(500).optional(),
      groqKey: z.string().trim().max(500).optional(),
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
registerStudioRoutes(app);
registerPublishRoutes(app);
registerResearchRoutes(app);
registerAnalyticsRoutes(app);
app.notFound((c) => c.json({ error: "Endpoint tidak ditemukan." }, 404));
async function jobs(env: Env, cron: string, scheduledTime = Date.now()) {
  const now = Date.now();
  const expiresAt = now + 1200000;
  const interval =
    cron === "0 1 * * *" ? 86400000 : cron === "0 * * * *" ? 3600000 : 300000;
  const occurrence = Math.floor(scheduledTime / interval) * interval;
  const lock = await env.DB.prepare(
    "INSERT INTO job_locks VALUES(?,?) ON CONFLICT(name) DO UPDATE SET expires_at=excluded.expires_at WHERE job_locks.expires_at < ?",
  )
    .bind(cron, expiresAt, now)
    .run();
  if (!lock.meta.changes) return;
  try {
    // Keep a durable receipt after the lease is released: repeated delivery must
    // not generate another paid AI draft for the same scheduled occurrence.
    const receipt = await env.DB.prepare(
      "INSERT OR IGNORE INTO cron_runs(name,scheduled_at,status,started_at) VALUES(?,?,'running',?)",
    )
      .bind(cron, occurrence, now)
      .run();
    if (!receipt.meta.changes) return;
    if (cron === "*/5 * * * *") {
      const outcomes = await Promise.allSettled([
        publishDue(env),
        deliverNotifications(env),
      ]);
      if (outcomes.some((result) => result.status === "rejected"))
        throw new Error("Sebagian pekerjaan publish/notifikasi gagal.");
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
        env.DB.prepare("DELETE FROM cron_runs WHERE started_at < ?").bind(
          now - 30 * 86400000,
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
    await env.DB.prepare(
      "UPDATE cron_runs SET status='completed',finished_at=? WHERE name=? AND scheduled_at=?",
    )
      .bind(Date.now(), cron, occurrence)
      .run();
  } catch (error) {
    await env.DB.prepare(
      "UPDATE cron_runs SET status='failed',finished_at=? WHERE name=? AND scheduled_at=?",
    )
      .bind(Date.now(), cron, occurrence)
      .run();
    console.error(
      JSON.stringify({
        event: "cron_failed",
        cron,
        scheduledTime,
        error: error instanceof Error ? error.name : "Error",
      }),
    );
    await log(
      env,
      "publish",
      `Pekerjaan terjadwal ${cron} gagal. Periksa log Worker.`,
    );
    throw error;
  } finally {
    await env.DB.prepare("DELETE FROM job_locks WHERE name=? AND expires_at=?")
      .bind(cron, expiresAt)
      .run();
  }
}
async function runScheduled(env: Env, cron: string, scheduledTime: number) {
  const scheduled = new Date(scheduledTime);
  const operations = [jobs(env, cron, scheduledTime)];
  if (cron === "*/5 * * * *" && scheduled.getUTCMinutes() === 0) {
    operations.push(
      (async () => {
        const hourly = await Promise.allSettled([
          jobs(env, "0 * * * *", scheduledTime),
        ]);
        // Build the daily report after the hourly research/analytics has finished.
        if (scheduled.getUTCHours() === 1)
          await jobs(env, "0 1 * * *", scheduledTime);
        if (hourly[0].status === "rejected") throw hourly[0].reason;
      })(),
    );
  }
  const outcomes = await Promise.allSettled(operations);
  if (outcomes.some((result) => result.status === "rejected"))
    throw new Error(
      "Sebagian pekerjaan cron gagal; pekerjaan lain telah dijalankan.",
    );
}
export { app, jobs, runScheduled };
export default {
  fetch: app.fetch,
  scheduled: (event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduled(env, event.cron, event.scheduledTime));
  },
};
