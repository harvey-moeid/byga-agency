import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Miniflare, createFetchMock } from "miniflare";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
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
        contents: `import worker, {app,runScheduled} from './worker/index.ts'; import {processPublishJob,enqueuePublish} from './worker/publishing.ts'; import {deliverNotifications} from './worker/notifications.ts';
          app.get('/test/process',async c=>{await processPublishJob(c.env,c.req.query('id'));return c.text('ok')});
          app.post('/test/enqueue',async c=>c.json({id:await enqueuePublish(c.env,await c.req.json())}));
          app.post('/test/scheduled',async c=>{const b=await c.req.json();await runScheduled(c.env,b.cron,b.time);return c.json({ok:true})});
          app.post('/test/notifications',async c=>{await deliverNotifications(c.env);return c.json({ok:true})});
          export default worker;`,
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
    for (const name of (await readdir("migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
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
  it("rejects stale edits and approvals even when the content status is unchanged", async () => {
    await seed("revision-test");
    const revised = await request("/api/contents/revision-test/transition", {
      action: "revise",
      expectedRevision: 0,
    });
    expect(revised.status).toBe(200);
    const revision = ((await revised.json()) as { revision: number }).revision;
    const edit = {
      title: "Test",
      caption: "New reviewed caption",
      prompt: "Vertical",
      expectedRevision: revision,
    };
    const results = await Promise.all([
      request("/api/contents/revision-test", edit, "PATCH"),
      request(
        "/api/contents/revision-test",
        { ...edit, caption: "Concurrent caption" },
        "PATCH",
      ),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const stale = await request("/api/contents/revision-test/transition", {
      action: "review",
      fileId: "revision-test",
      expectedRevision: revision,
    });
    expect(stale.status).toBe(409);
    const current = await db
      .prepare("SELECT data FROM contents WHERE id='revision-test'")
      .first<{ data: string }>();
    const item = JSON.parse(current!.data);
    expect(item.status).toBe("draft");
    const review = await request("/api/contents/revision-test/transition", {
      action: "review",
      fileId: "revision-test",
      expectedRevision: item.revision,
    });
    expect(review.status).toBe(200);
    const approved = await request("/api/contents/revision-test/transition", {
      action: "approve",
      expectedRevision: item.revision,
    });
    expect(approved.status).toBe(409);
  });
  it("atomically cancels an unstarted job and prevents a stale queue from restoring it", async () => {
    await seed("cancel-test");
    const previous = JSON.parse(
      (await db
        .prepare("SELECT data FROM contents WHERE id='cancel-test'")
        .first<{ data: string }>())!.data,
    );
    await queue("cancel-test");
    const rescheduled = await request("/api/contents/cancel-test/transition", {
      action: "schedule",
      date: "2030-01-01T09:00:00Z",
      expectedRevision: 0,
    });
    expect(rescheduled.status).toBe(200);
    expect(
      await db
        .prepare("SELECT id FROM publish_jobs WHERE content_id='cancel-test'")
        .first(),
    ).toBeNull();
    expect((await request("/test/enqueue", previous)).status).toBe(409);
    expect(
      await db
        .prepare("SELECT id FROM publish_jobs WHERE content_id='cancel-test'")
        .first(),
    ).toBeNull();
    const revised = await request("/api/contents/cancel-test/transition", {
      action: "revise",
      expectedRevision: 1,
    });
    expect(revised.status).toBe(200);
    expect((await request("/test/enqueue", previous)).status).toBe(409);
  });
  it("preserves approval and the job when a publisher already holds the lease", async () => {
    await seed("leased-test");
    const id = await queue("leased-test");
    await db
      .prepare(
        "UPDATE publish_jobs SET lease='active',lease_until=? WHERE id=?",
      )
      .bind(Date.now() + 60000, id)
      .run();
    for (const action of ["revise", "schedule"]) {
      expect(
        (
          await request("/api/contents/leased-test/transition", {
            action,
            date: "2030-01-01T09:00:00Z",
            expectedRevision: 0,
          })
        ).status,
      ).toBe(409);
    }
    expect(
      (await db
        .prepare("SELECT status FROM contents WHERE id='leased-test'")
        .first())!.status,
    ).toBe("approved");
    expect(
      (await db
        .prepare("SELECT lease FROM publish_jobs WHERE id=?")
        .bind(id)
        .first())!.lease,
    ).toBe("active");
    await db
      .prepare(
        "UPDATE publish_jobs SET status='uncertain',publish_id='remote-leased',lease_until=0 WHERE id=?",
      )
      .bind(id)
      .run();
    expect(
      (
        await request("/api/contents/leased-test/transition", {
          action: "revise",
        })
      ).status,
    ).toBe(409);
  });
  it("refuses using a GLB asset as the video under review", async () => {
    await seed("asset-test");
    await request("/api/contents/asset-test/transition", { action: "revise" });
    await db
      .prepare(
        "INSERT INTO files(id,name,size,type,created_at) VALUES('model-only','avatar.glb',100,'model/gltf-binary',?)",
      )
      .bind(new Date().toISOString())
      .run();
    expect(
      (
        await request("/api/contents/asset-test/transition", {
          action: "review",
          fileId: "model-only",
        })
      ).status,
    ).toBe(400);
    expect(
      (await db
        .prepare("SELECT status FROM contents WHERE id='asset-test'")
        .first())!.status,
    ).toBe("draft");
  });
  it("rejects final approval for a creator different from the one shown in the form", async () => {
    await seed("creator-approval");
    await request("/api/contents/creator-approval/transition", {
      action: "revise",
    });
    await request("/api/contents/creator-approval/transition", {
      action: "review",
      fileId: "creator-approval",
    });
    const rejected = await request(
      "/api/contents/creator-approval/transition",
      {
        action: "approve",
        expectedRevision: 2,
        publishOptions: { ...options, creatorId: "different-creator" },
      },
    );
    expect(rejected.status).toBe(503);
    expect(
      (await db
        .prepare("SELECT status FROM contents WHERE id='creator-approval'")
        .first())!.status,
    ).toBe("review");
    creatorReply();
    const accepted = await request(
      "/api/contents/creator-approval/transition",
      {
        action: "approve",
        expectedRevision: 2,
        publishOptions: { ...options, creatorId: "creator-one" },
      },
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({
      approvedCreatorId: "creator-one",
      publishOptions: { creatorId: "creator-one" },
    });
  });
  it("blocks publish if OAuth switches creator between the prerequisites and init", async () => {
    await seed("creator-race");
    const id = await queue("creator-race");
    const connection = await db
      .prepare(
        "SELECT open_id,encrypted_tokens FROM oauth_connections WHERE account_id='a'",
      )
      .first<{ open_id: string; encrypted_tokens: string }>();
    const replacement = await encrypt(
      JSON.stringify({
        access_token: "different-access",
        refresh_token: "different-refresh",
        open_id: "different-creator",
        scope: "user.info.basic,video.list,video.publish",
        expires_in: 86400,
      }),
      "test-encryption-key-for-mock-only-32",
    );
    let change: Promise<unknown> | undefined;
    api
      .intercept({
        path: "/v2/post/publish/creator_info/query/",
        method: "POST",
      })
      .reply(200, () => {
        change = db
          .prepare(
            "UPDATE oauth_connections SET open_id='different-creator',encrypted_tokens=? WHERE account_id='a'",
          )
          .bind(replacement)
          .run();
        return { data: creator, error: { code: "ok" } };
      });
    try {
      await request(`/test/process?id=${id}`);
      await change;
      expect(change).toBeDefined();
      expect(
        await db
          .prepare("SELECT status,publish_id FROM publish_jobs WHERE id=?")
          .bind(id)
          .first(),
      ).toMatchObject({ status: "blocked", publish_id: null });
      expect(
        (await db
          .prepare("SELECT status FROM contents WHERE id='creator-race'")
          .first())!.status,
      ).toBe("approved");
    } finally {
      await db
        .prepare(
          "UPDATE oauth_connections SET open_id=?,encrypted_tokens=? WHERE account_id='a'",
        )
        .bind(connection!.open_id, connection!.encrypted_tokens)
        .run();
    }
  });
  it("serves seekable video ranges and returns 416 for invalid or unsatisfiable ranges", async () => {
    const video = await readFile("tests/fixtures/sample.mp4");
    for (const [range, start, end] of [
      ["bytes=0-9", 0, 9],
      ["bytes=-10", video.length - 10, video.length - 1],
      [`bytes=${video.length - 5}-`, video.length - 5, video.length - 1],
    ] as const) {
      const response = await mf.dispatchFetch(base + "/api/files/post1", {
        headers: { Cookie: cookie, Range: range },
      });
      expect(response.status).toBe(206);
      expect(response.headers.get("content-range")).toBe(
        `bytes ${start}-${end}/${video.length}`,
      );
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(
        new Uint8Array(video.subarray(start, end + 1)),
      );
    }
    for (const range of [
      "bytes=99999999-",
      "bytes=9-2",
      "bytes=-0",
      "bytes=-",
      "bytes=0-1,4-5",
    ]) {
      const response = await mf.dispatchFetch(base + "/api/files/post1", {
        headers: { Cookie: cookie, Range: range },
      });
      expect(response.status).toBe(416);
      expect(response.headers.get("content-range")).toBe(
        `bytes */${video.length}`,
      );
    }
  });
  const encryptionKey = "test-encryption-key-for-mock-only-32";
  async function setCredential(name: string, value: string) {
    await db
      .prepare(
        "INSERT INTO credentials VALUES(?,?) ON CONFLICT(name) DO UPDATE SET encrypted=excluded.encrypted",
      )
      .bind(name, await encrypt(value, encryptionKey))
      .run();
  }
  async function setting(fields: Record<string, unknown>) {
    const row = await db
      .prepare("SELECT data FROM settings WHERE id=1")
      .first<{ data: string }>();
    await db
      .prepare("UPDATE settings SET data=? WHERE id=1")
      .bind(JSON.stringify({ ...JSON.parse(row!.data), ...fields }))
      .run();
  }
  it("refreshes expired OAuth tokens and stores the rotated token encrypted", async () => {
    await db
      .prepare("UPDATE oauth_connections SET expires_at=0 WHERE account_id='a'")
      .run();
    api.intercept({ path: "/v2/oauth/token/", method: "POST" }).reply(200, {
      access_token: "rotated-access",
      refresh_token: "rotated-refresh",
      open_id: "creator-one",
      scope: "user.info.basic,video.list,video.publish",
      expires_in: 86400,
    });
    creatorReply();
    expect((await request("/api/accounts/a/creator")).status).toBe(200);
    const connection = await db
      .prepare(
        "SELECT encrypted_tokens,refresh_lock_until,expires_at FROM oauth_connections WHERE account_id='a'",
      )
      .first<{
        encrypted_tokens: string;
        refresh_lock_until: number;
        expires_at: number;
      }>();
    expect(connection!.encrypted_tokens).not.toContain("rotated");
    expect(
      await decrypt(connection!.encrypted_tokens, encryptionKey),
    ).toContain("rotated-refresh");
    expect(connection!.refresh_lock_until).toBe(0);
    expect(connection!.expires_at).toBeGreaterThan(Date.now());
  });
  it("stores live analytics history from the remote video query", async () => {
    api
      .intercept({
        path: "/v2/video/query/?fields=id,view_count,like_count",
        method: "POST",
      })
      .reply(200, {
        data: { videos: [{ id: "video-1", view_count: 321, like_count: 45 }] },
        error: { code: "ok" },
      });
    const synced = await request("/api/analytics/sync", {});
    expect(await synced.json()).toEqual({ updated: 1, errors: [] });
    const history = await db
      .prepare(
        "SELECT views,likes FROM analytics_history WHERE content_id='post1'",
      )
      .first();
    expect(history).toMatchObject({ views: 321, likes: 45 });
    const row = await db
      .prepare("SELECT data FROM contents WHERE id='post1'")
      .first<{ data: string }>();
    expect(JSON.parse(row!.data).analyticsSyncedAt).toBeTruthy();
  });
  it("retains the research window across pagination and only completes after the last page", async () => {
    await setting({ researchEnabled: true });
    await setCredential("researchClientKey", "research-client");
    await setCredential("researchClientSecret", "research-secret");
    await db
      .prepare(
        "INSERT INTO competitors(id,handle,category) VALUES('paged','@reference','Test')",
      )
      .run();
    api
      .intercept({ path: "/v2/oauth/token/", method: "POST" })
      .reply(200, { access_token: "research-access", expires_in: 3600 });
    const bodies: Record<string, unknown>[] = [];
    const captured: Promise<void>[] = [];
    function captureBody(value: unknown) {
      captured.push(
        (async () => {
          let text = "";
          if (typeof value === "string") text = value;
          else if (
            value &&
            typeof value === "object" &&
            Symbol.asyncIterator in value
          ) {
            const decoder = new TextDecoder();
            for await (const chunk of value as AsyncIterable<Uint8Array>)
              text += decoder.decode(chunk, { stream: true });
            text += decoder.decode();
          } else throw new Error("Unexpected mock request body");
          bodies.push(JSON.parse(text));
        })(),
      );
    }
    const path =
      "/v2/research/video/query/?fields=id,username,video_description,create_time,view_count,like_count,comment_count,share_count";
    api.intercept({ path, method: "POST" }).reply(200, (opts) => {
      captureBody(opts.body);
      return {
        data: {
          videos: [
            {
              id: "paged-video1",
              username: "reference",
              create_time: 1,
              video_description: "#creative",
              view_count: 10,
            },
          ],
          has_more: true,
          cursor: 10,
          search_id: "search-one",
        },
        error: { code: "ok" },
      };
    });
    const firstPage = await request("/api/research/sync", {});
    expect(firstPage.status).toBe(200);
    await Promise.all(captured);
    expect(bodies).toHaveLength(1);
    expect(await firstPage.json()).toMatchObject({
      results: [{ checked: 1, videos: 1 }, { disabled: true }],
    });
    const interim = await db
      .prepare("SELECT cursor,last_checked FROM competitors WHERE id='paged'")
      .first<{ cursor: string; last_checked: string | null }>();
    expect(JSON.parse(interim!.cursor).cursor).toBe(10);
    expect(interim!.last_checked).toBeNull();
    api.intercept({ path, method: "POST" }).reply(200, (opts) => {
      captureBody(opts.body);
      return {
        data: {
          videos: [
            { id: "paged-video2", username: "reference", create_time: 2 },
          ],
          has_more: false,
          cursor: 20,
        },
        error: { code: "ok" },
      };
    });
    await request("/api/research/sync", {});
    await Promise.all(captured);
    expect(bodies[1]).toMatchObject({
      cursor: 10,
      search_id: "search-one",
      start_date: bodies[0].start_date,
      end_date: bodies[0].end_date,
    });
    expect(
      await db
        .prepare("SELECT cursor,last_checked FROM competitors WHERE id='paged'")
        .first(),
    ).toMatchObject({ cursor: null, last_checked: expect.any(String) });
    expect(
      (await db
        .prepare(
          "SELECT COUNT(*) AS n FROM research_videos WHERE competitor_id='paged'",
        )
        .first())!.n,
    ).toBe(2);
    await setting({ researchEnabled: false });
  });
  it("dispatches the single cron, generates once per occurrence, and honors delayed scheduledTime", async () => {
    await setting({ automaticDrafts: true });
    await setCredential("openrouterKey", "mock-openrouter-key");
    let generated = 0;
    mock
      .get("https://openrouter.ai")
      .intercept({ path: "/api/v1/chat/completions", method: "POST" })
      .reply(200, () => {
        generated++;
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Cron draft",
                  caption: "Cron caption",
                  prompt: "Vertical video",
                }),
              },
            },
          ],
        };
      });
    // The rate-limited job must not run as a side effect of this cron test.
    await db
      .prepare("UPDATE publish_jobs SET next_at=? WHERE status='retry_wait'")
      .bind(Date.now() + 3600000)
      .run();
    const time = Date.parse("2030-02-01T01:00:00Z");
    for (let i = 0; i < 2; i++)
      expect(
        (await request("/test/scheduled", { cron: "*/5 * * * *", time }))
          .status,
      ).toBe(200);
    expect(generated).toBe(1);
    expect(
      (await db
        .prepare("SELECT COUNT(*) AS n FROM cron_runs WHERE status='completed'")
        .first())!.n,
    ).toBe(3);
    const offHour = Date.parse("2030-02-01T01:05:00Z");
    await request("/test/scheduled", { cron: "*/5 * * * *", time: offHour });
    expect(
      (await db.prepare("SELECT COUNT(*) AS n FROM cron_runs").first())!.n,
    ).toBe(4);
    expect(generated).toBe(1);
    expect(await db.prepare("SELECT name FROM job_locks").first()).toBeNull();
    await setting({ automaticDrafts: false });
  });
  it("claims notification delivery once and retries rejected messages with backoff", async () => {
    await setting({ notification: "discord" });
    await setCredential(
      "discordWebhook",
      "https://discord.com/api/webhooks/123/mock-hook",
    );
    await db
      .prepare(
        "INSERT INTO notification_jobs(id,message,next_at,created_at) VALUES('notice-test','Test: posting gagal',0,?)",
      )
      .bind(new Date().toISOString())
      .run();
    let delivered = 0;
    mock
      .get("https://discord.com")
      .intercept({ path: "/api/webhooks/123/mock-hook", method: "POST" })
      .reply(503, () => {
        delivered++;
        return "";
      });
    await Promise.all([
      request("/test/notifications", {}),
      request("/test/notifications", {}),
    ]);
    expect(delivered).toBe(1);
    const retry = await db
      .prepare(
        "SELECT attempts,status,next_at,lease_until FROM notification_jobs WHERE id='notice-test'",
      )
      .first();
    expect(retry).toMatchObject({
      attempts: 1,
      status: "ready",
      lease_until: 0,
    });
    expect(Number(retry!.next_at)).toBeGreaterThan(Date.now());
    await db
      .prepare("UPDATE notification_jobs SET next_at=0 WHERE id='notice-test'")
      .run();
    mock
      .get("https://discord.com")
      .intercept({ path: "/api/webhooks/123/mock-hook", method: "POST" })
      .reply(204, "");
    await request("/test/notifications", {});
    expect(
      await db
        .prepare(
          "SELECT status,lease_until FROM notification_jobs WHERE id='notice-test'",
        )
        .first(),
    ).toMatchObject({ status: "sent", lease_until: 0 });
    await setting({ notification: "telegram" });
    await setCredential("telegramToken", "123:mock-token");
    await setCredential("telegramChatId", "123");
    await db
      .prepare(
        "INSERT INTO notification_jobs(id,message,next_at,created_at) VALUES('telegram-test','Test: konten siap di-approve',0,?)",
      )
      .bind(new Date().toISOString())
      .run();
    mock
      .get("https://api.telegram.org")
      .intercept({ path: "/bot123:mock-token/sendMessage", method: "POST" })
      .reply(200, { ok: false });
    await request("/test/notifications", {});
    expect(
      await db
        .prepare(
          "SELECT status,attempts FROM notification_jobs WHERE id='telegram-test'",
        )
        .first(),
    ).toMatchObject({ status: "ready", attempts: 1 });
    await setting({ notification: "none" });
  });
});
