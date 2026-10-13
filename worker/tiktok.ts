import type { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import type { Env } from "./env";
import type { CreatorInfo, PublishOptions } from "../src/domain";
import { credential, log } from "./db";
import { encrypt, decrypt, hash } from "./security";
const base = "https://open.tiktokapis.com/v2/";
const scopes = ["user.info.basic", "video.list", "video.publish"];
export class IntegrationUnavailable extends Error {}
export class TikTokError extends Error {
  constructor(
    public code: string,
    public retryable = false,
    public httpStatus = 0,
  ) {
    super(`TikTok: ${code}`);
    this.name = "TikTokError";
  }
}
export class AmbiguousRequest extends Error {
  constructor() {
    super(
      "Hasil permintaan TikTok belum pasti. Periksa status sebelum mengulang.",
    );
  }
}
export async function tiktok<T>(
  path: string,
  token: string,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new AmbiguousRequest();
  }
  const result = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { code: string };
  } | null;
  const code = result?.error?.code;
  if (!response.ok || !result || (code && code !== "ok"))
    throw new TikTokError(
      code || `http_${response.status}`,
      [429, 500, 502, 503, 504].includes(response.status) ||
        ["rate_limit_exceeded", "internal_error"].includes(code || ""),
      response.status,
    );
  if (!result.data) throw new TikTokError("invalid_response");
  return result.data;
}
interface Tokens {
  access_token: string;
  refresh_token: string;
  open_id: string;
  scope: string;
  expires_in: number;
  refresh_expires_in?: number;
}
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  open_id: z.string().min(1),
  scope: z.string(),
  expires_in: z.number().positive(),
  refresh_expires_in: z.number().optional(),
});
async function exchange(
  env: Env,
  params: Record<string, string>,
): Promise<Tokens> {
  const key = await credential(env, "tiktokClientKey"),
    secret = await credential(env, "tiktokClientSecret");
  if (!key || !secret)
    throw new IntegrationUnavailable(
      "Isi TikTok client key dan secret di Settings.",
    );
  let response: Response;
  try {
    response = await fetch(base + "oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: key,
        client_secret: secret,
        ...params,
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new TikTokError("token_service_unavailable", true);
  }
  if (!response.ok)
    throw new TikTokError(
      `token_http_${response.status}`,
      response.status >= 500 || response.status === 429,
    );
  const result = (await response.json()) as Record<string, unknown>;
  if (result.error) throw new TikTokError(String(result.error));
  return tokenSchema.parse(result);
}
export async function accessToken(
  env: Env,
  accountId: string,
  requiredScope?: string,
  expectedCreatorId?: string,
) {
  const row = await env.DB.prepare(
    "SELECT * FROM oauth_connections WHERE account_id=?",
  )
    .bind(accountId)
    .first<{
      encrypted_tokens: string;
      expires_at: number;
      scopes: string;
      refresh_lock_until: number;
    }>();
  if (!row)
    throw new IntegrationUnavailable(
      "Hubungkan akun TikTok melalui OAuth terlebih dahulu.",
    );
  if (requiredScope && !row.scopes.split(",").includes(requiredScope))
    throw new IntegrationUnavailable(
      `Akun belum memberikan izin ${requiredScope}. Hubungkan ulang setelah scope disetujui.`,
    );
  let tokens = JSON.parse(
    await decrypt(row.encrypted_tokens, env.ENCRYPTION_KEY),
  ) as Tokens;
  if (expectedCreatorId && tokens.open_id !== expectedCreatorId)
    throw new IntegrationUnavailable(
      "Identitas creator berubah. Hubungkan akun yang disetujui atau approve ulang.",
    );
  if (row.expires_at > Date.now() + 60000) return tokens.access_token;
  const nonce = crypto.randomUUID();
  const lease = await env.DB.prepare(
    "UPDATE oauth_connections SET refresh_lock=?,refresh_lock_until=? WHERE account_id=? AND refresh_lock_until < ?",
  )
    .bind(nonce, Date.now() + 60000, accountId, Date.now())
    .run();
  if (!lease.meta.changes)
    throw new TikTokError("token_refresh_in_progress", true);
  try {
    const previousIdentity = tokens.open_id;
    tokens = await exchange(env, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
    if (tokens.open_id !== previousIdentity)
      throw new IntegrationUnavailable("Identitas akun berubah saat refresh.");
    const result = await env.DB.prepare(
      "UPDATE oauth_connections SET encrypted_tokens=?,expires_at=?,scopes=? WHERE account_id=? AND refresh_lock=?",
    )
      .bind(
        await encrypt(JSON.stringify(tokens), env.ENCRYPTION_KEY),
        Date.now() + tokens.expires_in * 1000,
        tokens.scope,
        accountId,
        nonce,
      )
      .run();
    if (!result.meta.changes)
      throw new IntegrationUnavailable(
        "Koneksi akun berubah saat refresh. Muat ulang.",
      );
    if (requiredScope && !tokens.scope.split(",").includes(requiredScope))
      throw new IntegrationUnavailable(
        `Izin ${requiredScope} berubah. Hubungkan ulang akun TikTok.`,
      );
    return tokens.access_token;
  } catch (error) {
    if (
      error instanceof TikTokError &&
      ["invalid_grant", "invalid_refresh_token"].includes(error.code)
    ) {
      await env.DB.batch([
        env.DB.prepare(
          "DELETE FROM oauth_connections WHERE account_id=? AND refresh_lock=?",
        ).bind(accountId, nonce),
        env.DB.prepare("UPDATE accounts SET connected=0 WHERE id=?").bind(
          accountId,
        ),
      ]);
    }
    throw error;
  } finally {
    await env.DB.prepare(
      "UPDATE oauth_connections SET refresh_lock=NULL,refresh_lock_until=0 WHERE account_id=? AND refresh_lock=?",
    )
      .bind(accountId, nonce)
      .run();
  }
}
export async function creatorInfo(
  env: Env,
  accountId: string,
  expectedCreatorId?: string,
) {
  const identity = await env.DB.prepare(
    "SELECT open_id FROM oauth_connections WHERE account_id=?",
  )
    .bind(accountId)
    .first<{ open_id: string }>();
  if (
    !identity ||
    (expectedCreatorId && identity.open_id !== expectedCreatorId)
  )
    throw new IntegrationUnavailable(
      "Identitas creator berubah atau akun belum terhubung. Muat ulang final approval.",
    );
  try {
    const info = await tiktok<CreatorInfo>(
      "post/publish/creator_info/query/",
      await accessToken(env, accountId, "video.publish", identity.open_id),
      {},
    );
    return { ...info, creatorId: identity.open_id };
  } catch (error) {
    if (error instanceof AmbiguousRequest)
      throw new TikTokError("creator_unavailable", true);
    throw error;
  }
}
export const publishOptionsSchema = z.object({
  creatorId: z.string().min(1).max(200).optional(),
  privacyLevel: z.string().min(1),
  disableComment: z.boolean(),
  disableDuet: z.boolean(),
  disableStitch: z.boolean(),
  brandContent: z.boolean(),
  brandOrganic: z.boolean(),
  isAigc: z.boolean(),
  rightsConfirmed: z.literal(true),
  musicConfirmed: z.literal(true),
  publishConsent: z.literal(true),
});
export function validatePublishOptions(
  options: PublishOptions,
  creator: CreatorInfo,
  duration: number,
) {
  publishOptionsSchema.parse(options);
  if (!creator.privacy_level_options.includes(options.privacyLevel))
    throw new Error("Privasi tidak tersedia untuk creator ini. Pilih ulang.");
  if (
    (creator.comment_disabled && !options.disableComment) ||
    (creator.duet_disabled && !options.disableDuet) ||
    (creator.stitch_disabled && !options.disableStitch)
  )
    throw new Error("Pilihan interaksi tidak sesuai batas akun TikTok.");
  if (options.brandContent && options.privacyLevel === "SELF_ONLY")
    throw new Error("Branded content tidak dapat memakai privasi Only me.");
  if (duration <= 0 || duration > creator.max_video_post_duration_sec)
    throw new Error(
      `Durasi video melewati batas creator (${creator.max_video_post_duration_sec} detik).`,
    );
}
export function validateUploadUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !url.hostname.endsWith(".tiktokapis.com")
  )
    throw new Error("TikTok mengembalikan tujuan upload yang tidak diizinkan.");
  return url.toString();
}
export function redirectUri(env: Env) {
  const url = new URL(env.APP_URL);
  if (
    url.protocol !== "https:" &&
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("APP_URL harus HTTPS untuk OAuth.");
  return url.origin + "/api/tiktok/callback";
}
export function registerTikTokRoutes(app: Hono<{ Bindings: Env }>) {
  app.post("/api/accounts/:id/oauth", async (c) => {
    const id = c.req.param("id");
    if (
      !(await c.env.DB.prepare("SELECT id FROM accounts WHERE id=?")
        .bind(id)
        .first())
    )
      return c.notFound();
    const key = await credential(c.env, "tiktokClientKey");
    if (!key || !(await credential(c.env, "tiktokClientSecret")))
      throw new IntegrationUnavailable(
        "Isi TikTok client key dan secret di Settings.",
      );
    const state = crypto.randomUUID() + crypto.randomUUID(),
      cookie = crypto.randomUUID() + crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO oauth_states VALUES(?,?,?,?,?)")
      .bind(
        await hash(state),
        await hash(cookie),
        id,
        await hash(getCookie(c, "byga_session")!),
        Date.now() + 600000,
      )
      .run();
    setCookie(c, "byga_oauth", cookie, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      path: "/api/tiktok/callback",
      maxAge: 600,
    });
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.search = new URLSearchParams({
      client_key: key,
      response_type: "code",
      scope: scopes.join(","),
      redirect_uri: redirectUri(c.env),
      state,
    }).toString();
    return c.json({ url: url.toString(), redirectUri: redirectUri(c.env) });
  });
  app.get("/api/tiktok/callback", async (c) => {
    let outcome = "failed";
    try {
      const state = c.req.query("state"),
        code = c.req.query("code"),
        cookie = getCookie(c, "byga_oauth");
      if (!state || !cookie) throw new Error("OAuth state missing");
      const row = await c.env.DB.prepare(
        "DELETE FROM oauth_states WHERE state_hash=? AND cookie_hash=? AND expires_at>? RETURNING account_id,session_hash",
      )
        .bind(await hash(state), await hash(cookie), Date.now())
        .first<{ account_id: string; session_hash: string }>();
      if (
        !row ||
        !(await c.env.DB.prepare(
          "SELECT token_hash FROM sessions WHERE token_hash=? AND expires_at>?",
        )
          .bind(row.session_hash, Date.now())
          .first())
      )
        throw new Error("OAuth state invalid");
      if (c.req.query("error") || !code) throw new Error("OAuth declined");
      const tokens = await exchange(c.env, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(c.env),
      });
      const profile = await tiktok<{
        user: { open_id: string; display_name: string; avatar_url?: string };
      }>(
        "user/info/?fields=open_id,display_name,avatar_url",
        tokens.access_token,
      );
      if (profile.user.open_id !== tokens.open_id)
        throw new Error("Profile mismatch");
      await c.env.DB.batch([
        c.env.DB.prepare(
          "INSERT INTO oauth_connections(account_id,open_id,encrypted_tokens,scopes,expires_at,nickname,avatar_url) VALUES(?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET open_id=excluded.open_id,encrypted_tokens=excluded.encrypted_tokens,scopes=excluded.scopes,expires_at=excluded.expires_at,nickname=excluded.nickname,avatar_url=excluded.avatar_url,refresh_lock=NULL,refresh_lock_until=0",
        ).bind(
          row.account_id,
          tokens.open_id,
          await encrypt(JSON.stringify(tokens), c.env.ENCRYPTION_KEY),
          tokens.scope,
          Date.now() + tokens.expires_in * 1000,
          profile.user.display_name,
          profile.user.avatar_url || null,
        ),
        c.env.DB.prepare("UPDATE accounts SET connected=1 WHERE id=?").bind(
          row.account_id,
        ),
      ]);
      await log(
        c.env,
        "publish",
        "Akun TikTok berhasil terhubung melalui OAuth.",
      );
      outcome = "connected";
    } catch {
      await log(
        c.env,
        "publish",
        "OAuth TikTok gagal atau dibatalkan. Hubungkan ulang dari Settings.",
      );
    } finally {
      deleteCookie(c, "byga_oauth", { path: "/api/tiktok/callback" });
    }
    return c.redirect(
      new URL(`/?mode=live&oauth=${outcome}`, c.env.APP_URL).toString(),
      303,
    );
  });
  app.get("/api/accounts/:id/creator", async (c) =>
    c.json(await creatorInfo(c.env, c.req.param("id"))),
  );
  app.post("/api/accounts/:id/disconnect", async (c) => {
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(
      "SELECT encrypted_tokens FROM oauth_connections WHERE account_id=?",
    )
      .bind(id)
      .first<{ encrypted_tokens: string }>();
    if (row) {
      const tokens = JSON.parse(
        await decrypt(row.encrypted_tokens, c.env.ENCRYPTION_KEY),
      ) as Tokens;
      const key = await credential(c.env, "tiktokClientKey"),
        secret = await credential(c.env, "tiktokClientSecret");
      if (key && secret) {
        const response = await fetch(base + "oauth/revoke/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: key,
            client_secret: secret,
            token: tokens.access_token,
          }),
          redirect: "manual",
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok)
          throw new Error(
            "Revoke TikTok gagal. Koneksi lokal dipertahankan; coba lagi.",
          );
        const result = (await response.json().catch(() => ({}))) as {
          error?: string | { code?: string };
        };
        if (
          result.error &&
          (typeof result.error === "string"
            ? result.error !== "ok"
            : result.error.code !== "ok")
        )
          throw new Error("Revoke TikTok ditolak. Coba lagi.");
      }
      await c.env.DB.batch([
        c.env.DB.prepare(
          "DELETE FROM oauth_connections WHERE account_id=?",
        ).bind(id),
        c.env.DB.prepare("UPDATE accounts SET connected=0 WHERE id=?").bind(id),
        c.env.DB.prepare(
          "UPDATE publish_jobs SET status='blocked',last_error='Akun diputus. Hubungkan kembali sebelum publish.' WHERE account_id=? AND status IN ('ready','retry_wait')",
        ).bind(id),
      ]);
    }
    return c.json({ ok: true });
  });
}
