import { XMLParser } from "fast-xml-parser";
import type { Hono } from "hono";
import type { Env } from "./env";
import type { ResearchVideo, Trend } from "../src/domain";
import { credential, readSettings, log } from "./db";
import { encrypt, decrypt, hash } from "./security";
export const researchScope = "research.data.basic";
async function researchToken(env: Env) {
  const cached = await credential(env, "researchTokenCache");
  if (cached) {
    const data = JSON.parse(cached) as { token: string; expires: number };
    if (data.expires > Date.now() + 60000) return data.token;
  }
  const key = await credential(env, "researchClientKey"),
    secret = await credential(env, "researchClientSecret");
  if (!key || !secret)
    throw new Error(
      "Research API membutuhkan client key/secret proyek riset yang disetujui TikTok.",
    );
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: key,
      client_secret: secret,
      grant_type: "client_credentials",
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Research token gagal (${response.status}).`);
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: unknown;
  };
  if (!data.access_token || !data.expires_in || data.error)
    throw new Error("Akses Research API ditolak. Periksa izin proyek riset.");
  await env.DB.prepare(
    "INSERT INTO credentials VALUES(?,?) ON CONFLICT(name) DO UPDATE SET encrypted=excluded.encrypted",
  )
    .bind(
      "researchTokenCache",
      await encrypt(
        JSON.stringify({
          token: data.access_token,
          expires: Date.now() + data.expires_in * 1000,
        }),
        env.ENCRYPTION_KEY,
      ),
    )
    .run();
  return data.access_token;
}
const day = (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", "");
export function researchWindow(lastChecked?: string | null) {
  const now = new Date(),
    start = lastChecked
      ? new Date(lastChecked)
      : new Date(now.getTime() - 7 * 86400000);
  start.setUTCDate(start.getUTCDate() - 1);
  if (now.getTime() - start.getTime() > 29 * 86400000)
    start.setTime(now.getTime() - 29 * 86400000);
  return { start_date: day(start), end_date: day(now) };
}
interface VideoData {
  id: number | string;
  username: string;
  video_description?: string;
  create_time: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}
export function mapResearchVideo(
  video: VideoData,
  competitorId: string,
): ResearchVideo {
  return {
    id: String(video.id),
    competitorId,
    username: video.username,
    description: video.video_description || "",
    createdAt: new Date(video.create_time * 1000).toISOString(),
    views: video.view_count || 0,
    likes: video.like_count || 0,
    comments: video.comment_count || 0,
    shares: video.share_count || 0,
    hashtags: (video.video_description || "").match(/#[\p{L}\p{N}_]+/gu) || [],
    fetchedAt: new Date().toISOString(),
  };
}
async function competitorPage(
  env: Env,
  row: {
    id: string;
    handle: string;
    last_checked?: string | null;
    cursor?: string | null;
  },
  token: string,
) {
  await env.DB.prepare("UPDATE competitors SET last_attempt_at=? WHERE id=?")
    .bind(new Date().toISOString(), row.id)
    .run();
  try {
    const window = row.cursor
      ? JSON.parse(row.cursor)
      : researchWindow(row.last_checked);
    const response = await fetch(
      "https://open.tiktokapis.com/v2/research/video/query/?fields=id,username,video_description,create_time,view_count,like_count,comment_count,share_count",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: {
            and: [
              {
                operation: "EQ",
                field_name: "username",
                field_values: [row.handle.slice(1)],
              },
            ],
          },
          start_date: window.start_date,
          end_date: window.end_date,
          max_count: 100,
          cursor: window.cursor || 0,
          ...(window.search_id ? { search_id: window.search_id } : {}),
        }),
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) throw new Error(`Research API HTTP ${response.status}`);
    const result = (await response.json()) as {
      data?: {
        videos?: VideoData[];
        has_more?: boolean;
        cursor?: number;
        search_id?: string;
      };
      error?: { code: string };
    };
    if ((result.error?.code && result.error.code !== "ok") || !result.data)
      throw new Error("Research API menolak permintaan.");
    if (
      result.data.has_more &&
      (!result.data.search_id ||
        typeof result.data.cursor !== "number" ||
        result.data.cursor <= (window.cursor || 0))
    )
      throw new Error("Research pagination did not advance.");
    const entries = (result.data.videos || []).map((v) =>
      mapResearchVideo(v, row.id),
    );
    const stmts = entries.map((v) =>
      env.DB.prepare(
        "INSERT INTO research_videos VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,fetched_at=excluded.fetched_at",
      ).bind(v.id, row.id, JSON.stringify(v), v.fetchedAt),
    );
    const paging = result.data.has_more
      ? JSON.stringify({
          ...window,
          cursor: result.data.cursor,
          search_id: result.data.search_id,
        })
      : null;
    stmts.push(
      env.DB.prepare(
        "UPDATE competitors SET cursor=?,last_checked=CASE WHEN ? IS NULL THEN ? ELSE last_checked END,last_error=NULL WHERE id=?",
      ).bind(paging, paging, new Date().toISOString(), row.id),
    );
    await env.DB.batch(stmts);
    return entries.length;
  } catch {
    await env.DB.prepare("UPDATE competitors SET last_error=? WHERE id=?")
      .bind(
        "Pengambilan data gagal; periksa credential, izin Research API, dan kuota.",
        row.id,
      )
      .run();
    return 0;
  }
}
export async function syncCompetitors(env: Env) {
  if (!(await readSettings(env)).researchEnabled)
    return { checked: 0, videos: 0, disabled: true };
  const token = await researchToken(env);
  const rows = await env.DB.prepare(
    "SELECT id,handle,last_checked,cursor FROM competitors ORDER BY COALESCE(last_attempt_at,'') LIMIT 5",
  ).all<{
    id: string;
    handle: string;
    last_checked: string | null;
    cursor: string | null;
  }>();
  let count = 0;
  for (const row of rows.results)
    count += await competitorPage(env, row, token);
  await log(
    env,
    "research",
    `Research API: ${rows.results.length} akun diperiksa, ${count} video tersimpan.`,
  );
  return { checked: rows.results.length, videos: count };
}
export function parseTrends(
  xml: string,
): { title: string; traffic?: string; url?: string }[] {
  if (xml.length > 2000000) throw new Error("Feed terlalu besar.");
  const feed = new XMLParser({
    processEntities: false,
    ignoreAttributes: false,
  }).parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const items = feed.rss?.channel?.item;
  if (!items) return [];
  return (Array.isArray(items) ? items : [items])
    .slice(0, 20)
    .map((item) => {
      const data = item as Record<string, unknown>;
      return {
        title: String(data.title || "").slice(0, 200),
        traffic: String(data["ht:approx_traffic"] || ""),
        url: typeof data.link === "string" ? data.link : undefined,
      };
    })
    .filter((x) => x.title);
}
export async function syncWebTrends(env: Env) {
  if (!(await readSettings(env)).webTrendsEnabled)
    return { trends: 0, disabled: true };
  const response = await fetch(
    "https://trends.google.com/trending/rss?geo=ID",
    { redirect: "manual", signal: AbortSignal.timeout(30000) },
  );
  if (!response.ok)
    throw new Error(`Google Trends gagal (${response.status}).`);
  const reader = response.body!.getReader();
  let total = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > 2000000) {
      await reader.cancel();
      throw new Error("Feed terlalu besar.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const entries = parseTrends(new TextDecoder().decode(bytes));
  for (const entry of entries) {
    const id = await hash("google:" + day(new Date()) + ":" + entry.title);
    const item: Trend = {
      ...entry,
      id,
      source: "Google Trends ID",
      fetchedAt: new Date().toISOString(),
    };
    await env.DB.prepare(
      "INSERT INTO trends VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,fetched_at=excluded.fetched_at",
    )
      .bind(id, item.title, item.source, JSON.stringify(item), item.fetchedAt)
      .run();
  }
  await log(
    env,
    "research",
    `${entries.length} topik Google Trends diperbarui.`,
  );
  return { trends: entries.length };
}
export async function dailyResearchReport(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT data FROM research_videos WHERE fetched_at>=? ORDER BY fetched_at DESC LIMIT 100",
  )
    .bind(new Date(Date.now() - 86400000).toISOString())
    .all<{ data: string }>();
  const videos = rows.results.map((x) => JSON.parse(x.data) as ResearchVideo);
  const tags = new Map<string, number>();
  for (const v of videos)
    for (const tag of v.hashtags) tags.set(tag, (tags.get(tag) || 0) + v.views);
  const top = [...tags].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [tag, views] of top) {
    const id = await hash("tiktok:" + day(new Date()) + ":" + tag);
    const item: Trend = {
      id,
      title: tag,
      source: "TikTok Research · monitored accounts",
      fetchedAt: new Date().toISOString(),
      traffic: `${views} views pada sampel pantauan`,
    };
    await env.DB.prepare(
      "INSERT INTO trends VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,fetched_at=excluded.fetched_at",
    )
      .bind(id, tag, item.source, JSON.stringify(item), item.fetchedAt)
      .run();
  }
  const id = day(new Date());
  await env.DB.prepare(
    "INSERT INTO research_reports VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,created_at=excluded.created_at",
  )
    .bind(
      id,
      JSON.stringify({
        videos: videos.length,
        topHashtags: top,
        source: "monitored sample, not global TikTok trends",
      }),
      new Date().toISOString(),
    )
    .run();
}
export function registerResearchRoutes(app: Hono<{ Bindings: Env }>) {
  app.post("/api/research/sync", async (c) => {
    const outcomes = await Promise.allSettled([
      syncCompetitors(c.env),
      syncWebTrends(c.env),
    ]);
    return c.json({
      results: outcomes.map((x) =>
        x.status === "fulfilled"
          ? x.value
          : {
              error:
                x.reason instanceof Error ? x.reason.message : "Riset gagal.",
            },
      ),
    });
  });
  app.post("/api/research/report", async (c) => {
    await dailyResearchReport(c.env);
    return c.json({ ok: true });
  });
}
