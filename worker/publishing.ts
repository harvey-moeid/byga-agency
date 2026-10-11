import type { Hono } from "hono";
import type { Env } from "./env";
import type { Content, PublishOptions } from "../src/domain";
import { content, log } from "./db";
import { encrypt, decrypt } from "./security";
import {
  creatorInfo,
  validatePublishOptions,
  validateUploadUrl,
  accessToken,
  tiktok,
  IntegrationUnavailable,
  TikTokError,
  AmbiguousRequest,
} from "./tiktok";
import { notify, backoff } from "./notifications";
interface Job {
  id: string;
  content_id: string;
  account_id: string;
  status: string;
  attempts: number;
  next_at: number;
  publish_id: string | null;
  encrypted_upload: string | null;
  created_at: string;
  lease: string | null;
  last_error: string | null;
}
async function mark(
  env: Env,
  job: Job,
  status: string,
  error?: string,
  nextAt = Date.now(),
) {
  await env.DB.prepare(
    "UPDATE publish_jobs SET status=?,last_error=?,next_at=?,lease=NULL,lease_until=0,updated_at=? WHERE id=? AND lease=?",
  )
    .bind(
      status,
      error || null,
      nextAt,
      new Date().toISOString(),
      job.id,
      job.lease,
    )
    .run();
}
async function setContent(
  env: Env,
  id: string,
  status: Content["status"],
  error?: string,
  videoId?: string,
) {
  const item = await content(env, id);
  await env.DB.prepare("UPDATE contents SET status=?,data=? WHERE id=?")
    .bind(
      status,
      JSON.stringify({
        ...item,
        status,
        error,
        platformVideoId: videoId || item.platformVideoId,
        publishedAt:
          status === "published" ? new Date().toISOString() : item.publishedAt,
      }),
      id,
    )
    .run();
}
export async function enqueuePublish(
  env: Env,
  item: Content,
  due = Date.now(),
) {
  if (!["approved", "scheduled"].includes(item.status))
    throw new Error("Konten harus disetujui sebelum publish.");
  if (!item.fileId) throw new Error("Video belum tersedia.");
  const row = await env.DB.prepare(
    "SELECT id,status FROM publish_jobs WHERE content_id=?",
  )
    .bind(item.id)
    .first<{ id: string; status: string }>();
  if (row) {
    if (["blocked", "failed"].includes(row.status))
      throw new Error(
        "Revisi dan approve ulang konten sebelum mencoba pekerjaan baru.",
      );
    return row.id;
  }
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO publish_jobs(id,content_id,account_id,status,next_at,created_at,updated_at) VALUES(?,?,?,'ready',?,?,?)",
  )
    .bind(id, item.id, item.accountId, due, now, now)
    .run();
  return (await env.DB.prepare("SELECT id FROM publish_jobs WHERE content_id=?")
    .bind(item.id)
    .first<{ id: string }>())!.id;
}
export async function cancelUnstartedJob(env: Env, id: string) {
  const job = await env.DB.prepare(
    "SELECT status,publish_id,lease_until FROM publish_jobs WHERE content_id=?",
  )
    .bind(id)
    .first<{
      status: string;
      publish_id: string | null;
      lease_until: number;
    }>();
  if (
    job &&
    ((job.publish_id && job.status !== "failed") ||
      job.lease_until > Date.now() ||
      [
        "initializing",
        "uploading",
        "processing",
        "uncertain",
        "succeeded",
      ].includes(job.status))
  )
    throw new Error(
      "Publish sudah diproses atau hasilnya belum pasti. Periksa status TikTok sebelum revisi.",
    );
  if (job) {
    const deleted = await env.DB.prepare(
      "DELETE FROM publish_jobs WHERE content_id=? AND lease_until<=? AND status IN ('ready','retry_wait','blocked','failed') AND (publish_id IS NULL OR status='failed') RETURNING id",
    )
      .bind(id, Date.now())
      .first();
    if (!deleted)
      throw new Error(
        "Publish berubah saat revisi. Muat ulang sebelum mencoba lagi.",
      );
  }
}
async function prerequisites(env: Env, item: Content) {
  const identity = await env.DB.prepare(
    "SELECT open_id FROM oauth_connections WHERE account_id=?",
  )
    .bind(item.accountId)
    .first<{ open_id: string }>();
  if (!identity || identity.open_id !== item.approvedCreatorId)
    throw new IntegrationUnavailable(
      "Akun atau final approval berubah. Hubungkan akun dan approve ulang konten.",
    );
  if (item.caption.length > 2200)
    throw new IntegrationUnavailable("Caption TikTok maksimal 2200 karakter.");
  if (!item.publishOptions)
    throw new IntegrationUnavailable(
      "Final approval TikTok belum lengkap: pilih privasi, hak penggunaan, dan consent publish.",
    );
  const media = await env.DB.prepare(
    "SELECT type,size,media FROM files WHERE id=?",
  )
    .bind(item.fileId)
    .first<{ type: string; size: number; media: string | null }>();
  if (!media) throw new IntegrationUnavailable("File video tidak ditemukan.");
  if (media.type !== "video/mp4")
    throw new IntegrationUnavailable(
      "Ubah video ke MP4 sebelum publish TikTok.",
    );
  if (!media.media)
    throw new IntegrationUnavailable(
      "Metadata durasi video belum tersedia. Upload ulang video.",
    );
  const details = JSON.parse(media.media) as {
    duration: number;
    width: number;
    height: number;
  };
  if (Math.abs(details.width / details.height - 9 / 16) > 0.035)
    throw new IntegrationUnavailable(
      "Video untuk pipeline ini harus vertikal 9:16.",
    );
  const creator = await creatorInfo(env, item.accountId);
  validatePublishOptions(item.publishOptions, creator, details.duration);
  return media;
}
async function finish(
  env: Env,
  job: Job,
  data: {
    status: string;
    fail_reason?: string;
    publicaly_available_post_id?: string[];
    publicly_available_post_id?: string[];
    uploaded_bytes?: number;
  },
) {
  if (data.status === "PUBLISH_COMPLETE") {
    const videoId = (data.publicaly_available_post_id ||
      data.publicly_available_post_id)?.[0];
    await setContent(env, job.content_id, "published", undefined, videoId);
    await mark(env, job, "succeeded");
    await log(env, "publish", "TikTok mengonfirmasi publish selesai.");
  } else if (data.status === "FAILED") {
    await setContent(
      env,
      job.content_id,
      "failed",
      `TikTok menolak publish: ${data.fail_reason || "unknown"}`,
    );
    await mark(env, job, "failed", `TikTok: ${data.fail_reason || "unknown"}`);
    const a = await env.DB.prepare("SELECT name FROM accounts WHERE id=?")
      .bind(job.account_id)
      .first<{ name: string }>();
    await notify(
      env,
      `${a?.name || "Akun"}: posting gagal`,
      job.id + ":failed",
    );
  } else if (Date.now() - Date.parse(job.created_at) > 86400000) {
    await mark(
      env,
      job,
      "uncertain",
      "TikTok belum memberi hasil final setelah 24 jam. Periksa akun sebelum mengulang.",
    );
  } else await mark(env, job, "processing", undefined, Date.now() + 300000);
}
export async function processPublishJob(env: Env, id: string) {
  const nonce = crypto.randomUUID(),
    now = Date.now();
  const claim = await env.DB.prepare(
    "UPDATE publish_jobs SET lease=?,lease_until=? WHERE id=? AND lease_until<? AND status IN ('ready','retry_wait','upload_pending','processing','initializing','uploading') AND next_at<=?",
  )
    .bind(nonce, now + 600000, id, now, now)
    .run();
  if (!claim.meta.changes) return;
  const job = (await env.DB.prepare("SELECT * FROM publish_jobs WHERE id=?")
    .bind(id)
    .first<Job>())!;
  job.lease = nonce;
  try {
    const item = await content(env, job.content_id);
    // A crashed init cannot be safely repeated: TikTok has no client idempotency key.
    if (job.status === "initializing" && !job.publish_id) {
      await mark(
        env,
        job,
        "uncertain",
        "Permintaan init sebelumnya tidak memiliki hasil tersimpan. Cek TikTok; tidak diulang otomatis.",
      );
      return;
    }
    if (
      job.publish_id &&
      (job.status === "processing" || job.status === "uploading")
    ) {
      const state = await tiktok<{
        status: string;
        fail_reason?: string;
        publicaly_available_post_id?: string[];
      }>(
        "post/publish/status/fetch/",
        await accessToken(env, job.account_id, "video.publish"),
        { publish_id: job.publish_id },
      );
      await finish(env, job, state);
      return;
    }
    if (!job.publish_id) {
      await env.DB.prepare(
        "UPDATE publish_jobs SET attempts=attempts+1 WHERE id=? AND lease=?",
      )
        .bind(job.id, nonce)
        .run();
      job.attempts++;
      const file = await prerequisites(env, item);
      const p = item.publishOptions as PublishOptions;
      await env.DB.prepare(
        "UPDATE publish_jobs SET status='initializing' WHERE id=? AND lease=?",
      )
        .bind(job.id, nonce)
        .run();
      let initialized: { publish_id: string; upload_url: string };
      try {
        initialized = await tiktok(
          "post/publish/video/init/",
          await accessToken(env, job.account_id, "video.publish"),
          {
            post_info: {
              title: item.caption,
              privacy_level: p.privacyLevel,
              disable_comment: p.disableComment,
              disable_duet: p.disableDuet,
              disable_stitch: p.disableStitch,
              brand_content_toggle: p.brandContent,
              brand_organic_toggle: p.brandOrganic,
              is_aigc: p.isAigc,
            },
            source_info: {
              source: "FILE_UPLOAD",
              video_size: file.size,
              chunk_size: file.size,
              total_chunk_count: 1,
            },
          },
        );
      } catch (error) {
        if (
          error instanceof AmbiguousRequest ||
          (error instanceof TikTokError &&
            (error.httpStatus >= 500 || error.code === "invalid_response"))
        ) {
          await mark(
            env,
            job,
            "uncertain",
            "Init mungkin diterima TikTok, hasil belum pasti. Tidak membuat post kedua.",
          );
          return;
        }
        throw error;
      }
      if (!initialized.publish_id || !initialized.upload_url)
        throw new AmbiguousRequest();
      job.publish_id = initialized.publish_id;
      await env.DB.prepare(
        "UPDATE publish_jobs SET publish_id=?,encrypted_upload=?,status='upload_pending' WHERE id=? AND lease=?",
      )
        .bind(
          job.publish_id,
          await encrypt(initialized.upload_url, env.ENCRYPTION_KEY),
          job.id,
          nonce,
        )
        .run();
      job.encrypted_upload = await encrypt(
        initialized.upload_url,
        env.ENCRYPTION_KEY,
      );
    }
    const uploadUrl = validateUploadUrl(
      await decrypt(job.encrypted_upload!, env.ENCRYPTION_KEY),
    );
    const file = await env.FILES.get(item.fileId!);
    if (!file) throw new IntegrationUnavailable("File R2 tidak tersedia.");
    await env.DB.prepare(
      "UPDATE publish_jobs SET status='uploading' WHERE id=? AND lease=?",
    )
      .bind(job.id, nonce)
      .run();
    await setContent(env, item.id, "publishing");
    try {
      const stream = new FixedLengthStream(file.size);
      const pumping = file.body.pipeTo(stream.writable);
      const [response] = await Promise.all([
        fetch(uploadUrl, {
          method: "PUT",
          body: stream.readable,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": String(file.size),
            "Content-Range": `bytes 0-${file.size - 1}/${file.size}`,
          },
          redirect: "manual",
          signal: AbortSignal.timeout(120000),
        }),
        pumping,
      ]);
      if (!response.ok) {
        await mark(
          env,
          job,
          "processing",
          `Upload HTTP ${response.status}; memeriksa hasil TikTok sebelum mengulang.`,
          Date.now() + 300000,
        );
        return;
      }
    } catch {
      await mark(
        env,
        job,
        "processing",
        "Upload belum terkonfirmasi; memeriksa status TikTok.",
        Date.now() + 300000,
      );
      return;
    }
    await mark(env, job, "processing", undefined, Date.now() + 300000);
    await log(
      env,
      "publish",
      "Video dikirim; menunggu konfirmasi publish TikTok.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish gagal";
    if (error instanceof IntegrationUnavailable) {
      await mark(env, job, "blocked", message);
      return;
    }
    if (job.publish_id) {
      await mark(
        env,
        job,
        Date.now() - Date.parse(job.created_at) > 86400000
          ? "uncertain"
          : "processing",
        message,
        Date.now() + backoff(Math.max(1, job.attempts)),
      );
      return;
    }
    if (error instanceof AmbiguousRequest) {
      await mark(env, job, "uncertain", message);
      return;
    }
    const attempts = job.attempts || 1;
    if (error instanceof TikTokError && error.retryable && attempts < 5) {
      await mark(
        env,
        job,
        "retry_wait",
        message,
        Date.now() + backoff(attempts),
      );
      return;
    }
    await setContent(env, job.content_id, "failed", message);
    await mark(env, job, "failed", message);
    const a = await env.DB.prepare("SELECT name FROM accounts WHERE id=?")
      .bind(job.account_id)
      .first<{ name: string }>();
    await notify(
      env,
      `${a?.name || "Akun"}: posting gagal`,
      job.id + ":failed",
    );
  }
}
export async function publishDue(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT data FROM contents WHERE status='scheduled' AND scheduled_at<=? AND NOT EXISTS(SELECT 1 FROM publish_jobs WHERE content_id=contents.id) ORDER BY scheduled_at LIMIT 5",
  )
    .bind(new Date().toISOString())
    .all<{ data: string }>();
  for (const row of rows.results)
    await enqueuePublish(env, JSON.parse(row.data));
  const jobs = await env.DB.prepare(
    "SELECT id FROM publish_jobs WHERE status IN ('ready','retry_wait','upload_pending','processing','initializing','uploading') AND next_at<=? AND lease_until<? ORDER BY next_at LIMIT 3",
  )
    .bind(Date.now(), Date.now())
    .all<{ id: string }>();
  for (const job of jobs.results) await processPublishJob(env, job.id);
}
export function registerPublishRoutes(app: Hono<{ Bindings: Env }>) {
  app.post("/api/publish-jobs/:id/reconcile", async (c) => {
    const job = await c.env.DB.prepare(
      "SELECT publish_id,status FROM publish_jobs WHERE id=?",
    )
      .bind(c.req.param("id"))
      .first<{ publish_id: string | null; status: string }>();
    if (!job?.publish_id)
      throw new Error(
        "Tidak ada publish ID untuk rekonsiliasi. Periksa akun TikTok secara manual.",
      );
    if (["succeeded", "failed"].includes(job.status))
      return c.json({ ok: true });
    await c.env.DB.prepare(
      "UPDATE publish_jobs SET status='processing',next_at=? WHERE id=? AND lease_until<?",
    )
      .bind(Date.now(), c.req.param("id"), Date.now())
      .run();
    await processPublishJob(c.env, c.req.param("id"));
    return c.json({ ok: true });
  });
  app.post("/api/publish-jobs/:id/resume", async (c) => {
    const job = await c.env.DB.prepare(
      "SELECT content_id,status,publish_id FROM publish_jobs WHERE id=?",
    )
      .bind(c.req.param("id"))
      .first<{
        content_id: string;
        status: string;
        publish_id: string | null;
      }>();
    if (!job || job.status !== "blocked" || job.publish_id)
      throw new Error("Pekerjaan ini tidak dapat dilanjutkan otomatis.");
    await prerequisites(c.env, await content(c.env, job.content_id));
    await c.env.DB.prepare(
      "UPDATE publish_jobs SET status='ready',next_at=?,last_error=NULL WHERE id=? AND status='blocked'",
    )
      .bind(Date.now(), c.req.param("id"))
      .run();
    return c.json({ ok: true });
  });
}
