import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Miniflare, createFetchMock, FormData } from "miniflare";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import {
  defaultAgents,
  type StudioProject,
  type StudioStage,
  type StudioAgent,
  type CharacterProfile,
} from "../src/studio";
import { defaultUGCBrief } from "../src/ugc";
import { makeDemo, type Content } from "../src/domain";
import { ugcFixture } from "./fixtures/ugc";
const story = {
  ...ugcFixture,
  scenes: ugcFixture.scenes.map((s, i) => ({
    id: `s${i + 1}`,
    title: s.title,
    narration: s.narration,
    description: s.textToImage,
  })),
};
async function bodyText(value: unknown) {
  if (typeof value === "string") return value;
  let text = "";
  const decoder = new TextDecoder();
  for await (const chunk of value as AsyncIterable<Uint8Array>)
    text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}
describe("live studio storage, approval boundaries and cancellation", () => {
  let mf: Miniflare,
    db: Awaited<ReturnType<Miniflare["getD1Database"]>>,
    cookie = "";
  const mock = createFetchMock();
  mock.disableNetConnect();
  const remote = mock.get("https://openrouter.ai");
  const base = "https://agency.test";
  const brief = { ...defaultUGCBrief, idea: "Cerita ritual kopi pagi" };
  async function request(
    path: string,
    body?: unknown,
    method = body ? "POST" : "GET",
  ) {
    return mf.dispatchFetch(base + path, {
      method,
      headers: {
        Origin: base,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async function create(name = "Cerita kopi") {
    const result = await request("/api/studio/projects", {
      name,
      accountId: "a",
      brief,
    });
    expect(result.status).toBe(201);
    return (await result.json()) as StudioProject;
  }
  function respond(data: unknown, delay = 0) {
    const response = remote
      .intercept({ path: "/api/v1/chat/completions", method: "POST" })
      .reply(200, {
        choices: [{ message: { content: JSON.stringify(data) } }],
      });
    if (delay) response.delay(delay);
  }
  async function turn(
    p: StudioProject,
    action: StudioStage | "chat",
    data?: unknown,
    agentId = "content",
    sceneId?: string,
  ) {
    if (data) respond(data);
    const result = await request(`/api/studio/projects/${p.id}/turn`, {
      runId: crypto.randomUUID(),
      agentId,
      action,
      message: "Siapkan hasil untuk saya tinjau",
      expectedRevision: p.revision,
      sceneId,
    });
    expect(result.status, await result.clone().text()).toBe(200);
    return (await result.json()) as StudioProject;
  }
  async function approve(p: StudioProject) {
    const result = await request(
      `/api/studio/projects/${p.id}/proposals/${p.proposals.at(-1)!.id}/approve`,
      { expectedRevision: p.revision },
    );
    expect(result.status, await result.clone().text()).toBe(200);
    return (await result.json()) as {
      project: StudioProject;
      content?: Content;
    };
  }
  beforeAll(async () => {
    const bundle = await build({
      entryPoints: ["worker/index.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      mainFields: ["browser", "module", "main"],
    });
    mf = new Miniflare({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2025-10-11",
      d1Databases: ["DB"],
      r2Buckets: ["FILES"],
      fetchMock: mock,
      bindings: {
        DASHBOARD_PASSWORD: "test-password",
        ENCRYPTION_KEY: "test-encryption-key-for-mock-only-32",
        APP_URL: base,
      },
    });
    db = await mf.getD1Database("DB");
    for (const name of (await readdir("migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort())
      for (const sql of (await readFile(`migrations/${name}`, "utf8"))
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(sql).run();
    const login = await request("/api/login", { password: "test-password" });
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    await db
      .prepare("INSERT INTO accounts VALUES('a','Test','@test','#abcdef',0)")
      .run();
    const settings = await request(
      "/api/settings",
      {
        ...makeDemo().settings,
        keys: { openrouterKey: "studio-test-only-key" },
      },
      "PUT",
    );
    expect(settings.status).toBe(200);
  }, 30000);
  afterAll(async () => {
    await mf?.dispose();
    await mock.close();
  });

  it("requires session and trusted origin, and saves agent customization with revision checks", async () => {
    expect((await mf.dispatchFetch(base + "/api/studio")).status).toBe(401);
    const initial = await request("/api/studio");
    expect(
      ((await initial.json()) as { agents: StudioAgent[] }).agents,
    ).toEqual(defaultAgents);
    const profile = {
      ...defaultAgents[1],
      name: "Nara",
      preset: "custom",
      role: "Penulis cerita hangat",
      instructions:
        "Gunakan kalimat yang natural dan ringkas. Instruksi unik STUDIO_AGENT_TEST.",
    };
    const updated = await request("/api/studio/agents/content", profile, "PUT");
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ name: "Nara", revision: 1 });
    expect(
      (await request("/api/studio/agents/content", profile, "PUT")).status,
    ).toBe(409);
    const wrong = await mf.dispatchFetch(base + "/api/studio/projects", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "https://evil.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "No", accountId: "a" }),
    });
    expect(wrong.status).toBe(403);
  });
  it("autosaves drafts, lists only summaries and rejects stale writes", async () => {
    let p = await create();
    const updated = await request(
      `/api/studio/projects/${p.id}`,
      {
        expectedRevision: p.revision,
        brief: { ...brief, idea: "Draft private NEW_UNAPPROVED" },
      },
      "PATCH",
    );
    expect(updated.status).toBe(200);
    p = (await updated.json()) as StudioProject;
    expect(p.brief).toBeUndefined();
    const list = await request("/api/studio");
    const text = await list.text();
    expect(text).not.toContain("NEW_UNAPPROVED");
    expect(JSON.parse(text).projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: p.id, nextStage: "brief" }),
      ]),
    );
    expect(
      (
        await request(
          `/api/studio/projects/${p.id}`,
          { expectedRevision: 0, brief },
          "PATCH",
        )
      ).status,
    ).toBe(409);
  });
  it("uses approved shared context, its own chat and custom agent instructions", async () => {
    let p = await create("Isolasi konteks");
    p = (await approve(await turn(p, "brief"))).project;
    p = await turn(
      p,
      "chat",
      { message: "Pesan agen riset tersimpan." },
      "research",
    );
    const saved = await request(
      `/api/studio/projects/${p.id}`,
      {
        expectedRevision: p.revision,
        brief: { ...brief, idea: "SECRET_UNAPPROVED_BRIEF" },
      },
      "PATCH",
    );
    p = (await saved.json()) as StudioProject;
    let captured: Promise<string> | undefined;
    remote
      .intercept({ path: "/api/v1/chat/completions", method: "POST" })
      .reply(200, (opts) => {
        captured = bodyText(opts.body);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  message: "Saya memakai brief yang telah disetujui.",
                  suggestedAction: "story",
                }),
              },
            },
          ],
        };
      });
    p = await turn(p, "chat");
    const body = JSON.parse(await captured!);
    expect(body.messages[0].content).toContain("STUDIO_AGENT_TEST");
    expect(body.messages[0].content).toContain("Nara");
    expect(body.messages[1].content).not.toContain("SECRET_UNAPPROVED_BRIEF");
    expect(body.messages[1].content).not.toContain(
      "Pesan agen riset tersimpan",
    );
    expect(body.messages[1].content).toContain(brief.idea);
    const input = JSON.parse(body.messages[1].content);
    expect(
      input.conversation.some(
        (m: { ownPreview?: { agentId: string } }) =>
          m.ownPreview?.agentId === "content",
      ),
    ).toBe(true);
    expect(p.messages.filter((m) => m.agentId === "research")).toHaveLength(2);
    expect(p.messages.filter((m) => m.agentId === "content")).toHaveLength(5);
  });
  let finished: StudioProject;
  it("previews every stage and atomically creates one content draft after final approval", async () => {
    let p = await create("Proyek lengkap");
    expect(
      (
        await request(`/api/studio/projects/${p.id}/turn`, {
          runId: crypto.randomUUID(),
          agentId: "content",
          action: "story",
          message: "Buat cerita",
          expectedRevision: p.revision,
        })
      ).status,
    ).toBe(400);
    p = (await approve(await turn(p, "brief"))).project;
    p = (
      await approve(
        await turn(p, "story", {
          message: "Cerita siap ditinjau",
          data: story,
        }),
      )
    ).project;
    p = (
      await approve(
        await turn(
          p,
          "images",
          {
            message: "Prompt gambar siap",
            data: {
              prompts: story.scenes.map((s) => ({
                sceneId: s.id,
                prompt: s.description,
              })),
            },
          },
          "schedule",
        ),
      )
    ).project;
    p = (
      await approve(
        await turn(
          p,
          "videos",
          {
            message: "Prompt video siap",
            data: {
              prompts: story.scenes.map((s, i) => ({
                sceneId: s.id,
                prompt: ugcFixture.scenes[i].imageToVideo,
              })),
            },
          },
          "publish",
        ),
      )
    ).project;
    p = (
      await approve(
        await turn(
          p,
          "review",
          {
            message: "Review siap",
            data: {
              summary: "Alur dan semua prompt sudah tersedia.",
              issues: ["Periksa hasil render sebelum publish."],
            },
          },
          "analytics",
        ),
      )
    ).project;
    p = await turn(p, "final");
    expect(
      (await db.prepare("SELECT COUNT(*) AS n FROM contents").first())!.n,
    ).toBe(0);
    const accepted = await approve(p);
    expect(accepted.content).toMatchObject({
      status: "draft",
      studioProjectId: p.id,
      ugc: { scenes: expect.any(Array) },
    });
    expect(
      (await db.prepare("SELECT COUNT(*) AS n FROM contents").first())!.n,
    ).toBe(1);
    const duplicate = await request(
      `/api/studio/projects/${p.id}/proposals/${p.proposals.at(-1)!.id}/approve`,
      { expectedRevision: accepted.project.revision },
    );
    expect(duplicate.status).toBe(409);
    expect(
      (await db.prepare("SELECT COUNT(*) AS n FROM contents").first())!.n,
    ).toBe(1);
    finished = accepted.project;
  });
  it("revises only the requested scene and preserves both approved versions", async () => {
    const changed = structuredClone(story);
    changed.characterLock = "MUST_NOT_REPLACE_GLOBAL_CHARACTER";
    changed.scenes[1].narration = "Narasi revisi yang lebih hangat.";
    changed.scenes[1].description =
      "A new close-up in warm light, with the same creator and blue mug.";
    changed.scenes[0].description = "MUST_NOT_CHANGE_OTHER_SCENE";
    let p = await turn(
      finished,
      "story",
      { message: "Revisi adegan kedua", data: changed },
      "content",
      "s2",
    );
    const proposal = p.proposals.at(-1)!;
    expect(
      proposal.payload.stage === "story" && proposal.payload.data.characterLock,
    ).toBe(story.characterLock);
    p = (await approve(p)).project;
    expect(p.story!.data.scenes[0]).toEqual(story.scenes[0]);
    expect(p.story!.data.scenes[1].narration).toBe(changed.scenes[1].narration);
    expect(p.history.filter((h) => h.payload.stage === "story")).toHaveLength(
      2,
    );
    expect((await request("/api/studio")).status).toBe(200);
    const exported = await request(`/api/studio/projects/${p.id}`);
    expect(((await exported.json()) as StudioProject).images.s2).toBeTruthy();
    finished = p;
  });
  it("cancels an in-flight turn without storing or approving its late result", async () => {
    const p = await create("Pembatalan");
    const runId = crypto.randomUUID();
    respond({ message: "LATE_RESULT_MUST_NOT_APPEAR" }, 250);
    const generating = request(`/api/studio/projects/${p.id}/turn`, {
      runId,
      agentId: "content",
      action: "chat",
      message: "Tolong pikirkan ide",
      expectedRevision: p.revision,
    });
    for (let i = 0; i < 40; i++) {
      const current = await db
        .prepare("SELECT data FROM studio_projects WHERE id=?")
        .bind(p.id)
        .first<{ data: string }>();
      if (JSON.parse(current!.data).run) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    const cancelled = await request(`/api/studio/projects/${p.id}/cancel`, {
      runId,
    });
    expect(cancelled.status).toBe(200);
    expect((await generating).status).toBe(409);
    const result = await request(`/api/studio/projects/${p.id}`);
    const project = (await result.json()) as StudioProject;
    expect(project.run).toBeUndefined();
    expect(JSON.stringify(project)).not.toContain(
      "LATE_RESULT_MUST_NOT_APPEAR",
    );
    expect(project.messages[0].text).toBe("Tolong pikirkan ide");
  });
  it("saves a character reference image, preserves its profile and protects the asset", async () => {
    const png = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOcQAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const form = new FormData();
    form.append("file", new File([png], "karakter.png", { type: "image/png" }));
    const upload = await mf.dispatchFetch(base + "/api/files", {
      method: "POST",
      headers: { Cookie: cookie, Origin: base },
      body: form,
    });
    expect(upload.status, await upload.clone().text()).toBe(200);
    const id = ((await upload.json()) as { id: string }).id;
    const image = await request(`/api/files/${id}`);
    expect(image.headers.get("content-type")).toBe("image/png");
    const character: CharacterProfile = {
      id: crypto.randomUUID(),
      name: "Ayu",
      appearance: "Kreator dewasa berambut hitam",
      outfit: "Kaus krem",
      revision: 0,
      referenceAssetId: id,
    };
    expect(
      (
        await request(
          `/api/studio/characters/${character.id}`,
          character,
          "PUT",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/api/studio/characters/${character.id}`,
          character,
          "PUT",
        )
      ).status,
    ).toBe(409);
    expect(
      (await request(`/api/files/${id}`, undefined, "DELETE")).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/api/studio/characters/${crypto.randomUUID()}`,
          { ...character, id: "invalid", referenceAssetId: "missing" },
          "PUT",
        )
      ).status,
    ).toBe(400);
  });
});
