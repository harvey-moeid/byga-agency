import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Miniflare, createFetchMock } from "miniflare";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { encrypt, decrypt } from "../worker/security";
import { validatePublishOptions, validateUploadUrl } from "../worker/tiktok";
import { deadline } from "../worker/db";
import { backoff } from "../worker/notifications";
import {
  parseTrends,
  mapResearchVideo,
  researchWindow,
} from "../worker/research";
import { historicalRecommendation } from "../worker/analytics";
import { demoDraft } from "../src/domain";
import { dateInput, localToISO } from "../src/time";
const creator = {
  creator_avatar_url: "",
  creator_username: "test",
  creator_nickname: "Test",
  privacy_level_options: ["SELF_ONLY"],
  comment_disabled: false,
  duet_disabled: true,
  stitch_disabled: true,
  max_video_post_duration_sec: 60,
};
const options = {
  privacyLevel: "SELF_ONLY",
  disableComment: false,
  disableDuet: true,
  disableStitch: true,
  brandContent: false,
  brandOrganic: false,
  isAigc: true,
  rightsConfirmed: true,
  musicConfirmed: true,
  publishConsent: true,
} as const;
describe("integration guards", () => {
  it("parses real research fields and bounded trends feeds", () => {
    expect(
      parseTrends(
        "<rss><channel><item><title>Indonesia</title><ht:approx_traffic>1000+</ht:approx_traffic></item></channel></rss>",
      ),
    ).toEqual([{ title: "Indonesia", traffic: "1000+", url: undefined }]);
    expect(() => parseTrends("x".repeat(2000001))).toThrow();
    expect(
      mapResearchVideo(
        {
          id: "123",
          username: "test",
          create_time: 1,
          video_description: "#kreatif #日本",
          view_count: 42,
        },
        "competitor",
      ).hashtags,
    ).toEqual(["#kreatif", "#日本"]);
    const window = researchWindow("2000-01-01");
    expect(window.start_date).toHaveLength(8);
  });
  it("requires synced analytics before suggesting a posting hour", () => {
    const post = {
      ...demoDraft("A test topic", "a"),
      status: "published" as const,
      platformVideoId: "v",
      publishedAt: "2030-01-01T02:00:00Z",
      views: 100,
    };
    expect(historicalRecommendation([post, post, post], "a").bestHours).toEqual(
      [],
    );
    expect(
      historicalRecommendation(
        [post, post, post].map((p) => ({
          ...p,
          analyticsSyncedAt: "2030-01-02T00:00:00Z",
        })),
        "a",
      ).bestHours,
    ).toEqual([9]);
    expect(() => localToISO("2030-02-30T09:00")).toThrow();
  });

  it("enforces creator privacy, interactions, duration and explicit consent", () => {
    expect(() => validatePublishOptions(options, creator, 30)).not.toThrow();
    for (const invalid of [
      { ...options, privacyLevel: "PUBLIC_TO_EVERYONE" },
      { ...options, disableDuet: false },
      { ...options, brandContent: true },
      { ...options, publishConsent: false },
    ])
      expect(() =>
        validatePublishOptions(invalid as typeof options, creator, 30),
      ).toThrow();
    expect(() => validatePublishOptions(options, creator, 61)).toThrow();
  });
  it("rejects arbitrary upload destinations", () => {
    expect(validateUploadUrl("https://upload.tiktokapis.com/video")).toContain(
      "tiktokapis.com",
    );
    for (const url of [
      "http://upload.tiktokapis.com/x",
      "https://tiktokapis.com.evil.test/x",
      "https://localhost/x",
      "https://user@upload.tiktokapis.com/x",
    ])
      expect(() => validateUploadUrl(url)).toThrow();
  });
  it("keeps Jakarta schedule and month retention consistent", () => {
    expect(localToISO("2030-01-01T09:00", "Asia/Jakarta")).toBe(
      "2030-01-01T02:00:00.000Z",
    );
    expect(dateInput("2030-01-01T02:00:00Z", "Asia/Jakarta")).toBe(
      "2030-01-01T09:00",
    );
    expect(deadline(1, new Date("2024-03-31T00:00:00Z"))).toBe(
      "2024-02-29T00:00:00.000Z",
    );
    expect([1, 2, 3, 5, 10].map(backoff)).toEqual([
      60000, 120000, 240000, 960000, 3600000,
    ]);
  });
});
describe("Worker OAuth and publish contracts with mocked remote APIs", () => {
  let mf: Miniflare,
    db: Awaited<ReturnType<Miniflare["getD1Database"]>>,
    cookie = "";
  const mock = createFetchMock();
  mock.disableNetConnect();
  const api = mock.get("https://open.tiktokapis.com");
  const base = "https://agency.test";
  async function request(
    path: string,
    body?: unknown,
    method = body ? "POST" : "GET",
    extraCookie = "",
  ) {
    return mf.dispatchFetch(base + path, {
      method,
      headers: {
        Origin: base,
        Cookie: cookie + (extraCookie ? "; " + extraCookie : ""),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
  }
  beforeAll(async () => {
    const bundled = await build({
      stdin: {
        contents: `import app from './worker/index.ts'; import {processPublishJob} from './worker/publishing.ts'; export default {fetch(req,env,ctx){const u=new URL(req.url); if(u.pathname==='/test/process') return processPublishJob(env,u.searchParams.get('id')).then(()=>new Response('ok'));return app.fetch(req,env,ctx);}}`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      mainFields: ["browser", "module", "main"],
    });
    mf = new Miniflare({
      modules: true,
      script: bundled.outputFiles[0].text,
      compatibilityDate: "2025-10-11",
      d1Databases: ["DB"],
      r2Buckets: ["FILES"],
      bindings: {
        DASHBOARD_PASSWORD: "test-password",
        ENCRYPTION_KEY: "test-encryption-key-for-mock-only-32",
        APP_URL: base,
      },
      fetchMock: mock,
    });
    db = await mf.getD1Database("DB");
    for (const name of ["0001_initial.sql", "0002_integrations.sql"]) {
      const sql = await readFile("migrations/" + name, "utf8");
      for (const statement of sql
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean))
        await db.prepare(statement).run();
    }
    const login = await request("/api/login", { password: "test-password" });
    expect(login.status).toBe(200);
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    await db
      .prepare("INSERT INTO accounts VALUES('a','Test','@test','#abcdef',0)")
      .run();
    for (const [name, value] of [
      ["tiktokClientKey", "test-client"],
      ["tiktokClientSecret", "test-secret"],
    ])
      await db
        .prepare("INSERT INTO credentials VALUES(?,?)")
        .bind(
          name,
          await encrypt(value, "test-encryption-key-for-mock-only-32"),
        )
        .run();
  }, 30000);
  afterAll(async () => {
    await mf?.dispose();
    await mock.close();
  });
  it("binds OAuth state to the login session, encrypts tokens, and refuses callback replay", async () => {
    const start = await request("/api/accounts/a/oauth", {});
    expect(start.status).toBe(200);
    const state = new URL(
      ((await start.json()) as { url: string }).url,
    ).searchParams.get("state")!;
    const oauthCookie = start.headers.get("set-cookie")!.split(";")[0];
    api.intercept({ path: "/v2/oauth/token/", method: "POST" }).reply(200, {
      access_token: "mock-access",
      refresh_token: "mock-refresh",
      open_id: "creator-one",
      scope: "user.info.basic,video.list,video.publish",
      expires_in: 86400,
    });
    api
      .intercept({
        path: "/v2/user/info/?fields=open_id,display_name,avatar_url",
        method: "GET",
      })
      .reply(200, {
        data: {
          user: { open_id: "creator-one", display_name: "Test Creator" },
        },
        error: { code: "ok" },
      });
    const callback = await request(
      `/api/tiktok/callback?state=${state}&code=mock-code`,
      undefined,
      "GET",
      oauthCookie,
    );
    expect(callback.headers.get("location")).toContain("oauth=connected");
    const connection = await db
      .prepare(
        "SELECT encrypted_tokens FROM oauth_connections WHERE account_id='a'",
      )
      .first<{ encrypted_tokens: string }>();
    expect(connection!.encrypted_tokens).not.toContain("mock-access");
    expect(
      await decrypt(
        connection!.encrypted_tokens,
        "test-encryption-key-for-mock-only-32",
      ),
    ).toContain("mock-access");
    const workspace = await (await request("/api/workspace")).text();
    expect(workspace).not.toContain("mock-access");
    expect(workspace).not.toContain("mock-refresh");
    const replay = await request(
      `/api/tiktok/callback?state=${state}&code=mock-code`,
      undefined,
      "GET",
      oauthCookie,
    );
    expect(replay.headers.get("location")).toContain("oauth=failed");
  });
  async function seed(id: string) {
    const video = new Uint8Array(await readFile("tests/fixtures/sample.mp4"));
    await (await mf.getR2Bucket("FILES")).put(id, video);
    await db
      .prepare("INSERT INTO files VALUES(?,?,?,?,?,?)")
      .bind(
        id,
        "video.mp4",
        video.length,
        "video/mp4",
        new Date().toISOString(),
        JSON.stringify({ width: 90, height: 160, duration: 1 }),
      )
      .run();
    const item = {
      id,
      accountId: "a",
      title: "Test",
      caption: "Reviewed",
      prompt: "Vertical",
      status: "approved",
      fileId: id,
      createdAt: new Date().toISOString(),
      views: 0,
      likes: 0,
      approvedCreatorId: "creator-one",
      publishOptions: options,
    };
    await db
      .prepare("INSERT INTO contents VALUES(?,?,?,'approved',NULL,?,?)")
      .bind(id, "a", JSON.stringify(item), item.createdAt, id)
      .run();
  }
  function creatorReply() {
    api
      .intercept({
        path: "/v2/post/publish/creator_info/query/",
        method: "POST",
      })
      .reply(200, { data: creator, error: { code: "ok" } });
  }
  async function queue(id: string) {
    creatorReply();
    const res = await request(`/api/contents/${id}/transition`, {
      action: "publish",
    });
    expect(res.status).toBe(200);
    return (await db
      .prepare("SELECT id FROM publish_jobs WHERE content_id=?")
      .bind(id)
      .first<{ id: string }>())!.id;
  }
  it("uploads once and waits for remote confirmation before marking published", async () => {
    await seed("post1");
    const id = await queue("post1");
    creatorReply();
    api
      .intercept({ path: "/v2/post/publish/video/init/", method: "POST" })
      .reply(200, {
        data: {
          publish_id: "remote-post1",
          upload_url: "https://upload.tiktokapis.com/video",
        },
        error: { code: "ok" },
      });
    mock
      .get("https://upload.tiktokapis.com")
      .intercept({ path: "/video", method: "PUT" })
      .reply(201, "");
    await request(`/test/process?id=${id}`);
    expect(
      (await db
        .prepare("SELECT status FROM contents WHERE id='post1'")
        .first())!.status,
    ).toBe("publishing");
    await db
      .prepare("UPDATE publish_jobs SET next_at=0 WHERE id=?")
      .bind(id)
      .run();
    api
      .intercept({ path: "/v2/post/publish/status/fetch/", method: "POST" })
      .reply(200, {
        data: {
          status: "PUBLISH_COMPLETE",
          publicaly_available_post_id: ["video-1"],
        },
        error: { code: "ok" },
      });
    await request(`/test/process?id=${id}`);
    expect(
      (await db
        .prepare("SELECT status FROM contents WHERE id='post1'")
        .first())!.status,
    ).toBe("published");
    await request(`/test/process?id=${id}`);
    expect(
      (await db
        .prepare("SELECT attempts FROM publish_jobs WHERE id=?")
        .bind(id)
        .first())!.attempts,
    ).toBe(1);
  });
  it("does not initialize a second post after an ambiguous server error", async () => {
    await seed("post2");
    const id = await queue("post2");
    creatorReply();
    api
      .intercept({ path: "/v2/post/publish/video/init/", method: "POST" })
      .reply(500, { error: { code: "internal_error" } });
    await request(`/test/process?id=${id}`);
    expect(
      (await db
        .prepare("SELECT status FROM publish_jobs WHERE id=?")
        .bind(id)
        .first())!.status,
    ).toBe("uncertain");
    await request(`/test/process?id=${id}`);
    expect(
      (await db
        .prepare("SELECT attempts FROM publish_jobs WHERE id=?")
        .bind(id)
        .first())!.attempts,
    ).toBe(1);
  });
  it("backs off a known rate limit instead of marking a post successful", async () => {
    await seed("post3");
    const id = await queue("post3");
    creatorReply();
    api
      .intercept({ path: "/v2/post/publish/video/init/", method: "POST" })
      .reply(429, { error: { code: "rate_limit_exceeded" } });
    await request(`/test/process?id=${id}`);
    const job = await db
      .prepare("SELECT status,next_at FROM publish_jobs WHERE id=?")
      .bind(id)
      .first();
    expect(job!.status).toBe("retry_wait");
    expect(Number(job!.next_at)).toBeGreaterThan(Date.now());
  });
});
