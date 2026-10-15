import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare, createFetchMock } from "miniflare";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import { decrypt } from "../worker/security";
import { makeDemo, type Content } from "../src/domain";
import { defaultUGCBrief } from "../src/ugc";
import { ugcFixture } from "./fixtures/ugc";

// Explicit remote contracts: changing an adapter must still match the provider API.
const providers = [
  {
    id: "openrouter",
    label: "OpenRouter",
    key: "openrouterKey",
    model: "openai/gpt-4o-mini",
    origin: "https://openrouter.ai",
    path: "/api/v1/chat/completions",
    jsonMode: true,
  },
  {
    id: "gemini",
    label: "Gemini",
    key: "geminiKey",
    model: "gemini-2.5-flash-lite",
    origin: "https://generativelanguage.googleapis.com",
    path: "/v1beta/models/gemini-2.5-flash-lite:generateContent",
    jsonMode: false,
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    key: "nvidiaKey",
    model: "meta/llama-3.1-8b-instruct",
    origin: "https://integrate.api.nvidia.com",
    path: "/v1/chat/completions",
    jsonMode: false,
  },
  {
    id: "cohere",
    label: "Cohere",
    key: "cohereKey",
    model: "command-a-03-2025",
    origin: "https://api.cohere.com",
    path: "/v2/chat",
    jsonMode: true,
  },
  {
    id: "huggingface",
    label: "Hugging Face",
    key: "huggingfaceKey",
    model: "meta-llama/Llama-3.3-70B-Instruct",
    origin: "https://router.huggingface.co",
    path: "/v1/chat/completions",
    jsonMode: false,
  },
  {
    id: "mistral",
    label: "Mistral",
    key: "mistralKey",
    model: "mistral-small-latest",
    origin: "https://api.mistral.ai",
    path: "/v1/chat/completions",
    jsonMode: true,
  },
  {
    id: "groq",
    label: "Groq",
    key: "groqKey",
    model: "llama-3.3-70b-versatile",
    origin: "https://api.groq.com",
    path: "/openai/v1/chat/completions",
    jsonMode: true,
  },
] as const;
const draft = {
  title: "Ide kreatif",
  caption: "Caption Indonesia",
  prompt: "Video 9:16, 20 detik",
};
const output = JSON.stringify(draft);
function reply(id: string, text = output): object {
  if (id === "gemini")
    return {
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: "Internal reasoning" },
              { text: text.slice(0, 20) },
              { text: text.slice(20) },
            ],
          },
        },
      ],
    };
  if (id === "cohere")
    return {
      message: {
        content: [
          { type: "thinking", text: "Internal reasoning" },
          { type: "text", text: text.slice(0, 20) },
          { type: "text", text: text.slice(20) },
        ],
      },
    };
  return { choices: [{ message: { content: text } }] };
}
async function bodyText(body: unknown) {
  if (typeof body === "string") return body;
  let text = "";
  const decoder = new TextDecoder();
  for await (const chunk of body as AsyncIterable<Uint8Array>)
    text += decoder.decode(chunk, { stream: true });
  return text + decoder.decode();
}

describe("AI provider settings, encrypted credentials and generation contracts", () => {
  let mf: Miniflare;
  let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
  let cookie = "";
  const mock = createFetchMock();
  mock.disableNetConnect();
  const base = "https://agency.test";
  const encryptionKey = "test-encryption-key-for-mock-only-32";
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
  async function select(provider: (typeof providers)[number], keys = {}) {
    const result = await request(
      "/api/settings",
      {
        ...makeDemo().settings,
        provider: provider.id,
        model: provider.model,
        keys,
      },
      "PUT",
    );
    expect(result.status).toBe(200);
  }
  function generate() {
    return request("/api/contents/generate", {
      brief: "Rutinitas kreatif pagi",
      accountId: "a",
    });
  }
  async function contentCount() {
    return (await db
      .prepare("SELECT COUNT(*) AS n FROM contents")
      .first<{ n: number }>())!.n;
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
        ENCRYPTION_KEY: encryptionKey,
        APP_URL: base,
      },
    });
    db = await mf.getD1Database("DB");
    for (const file of (await readdir("migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      for (const sql of (await readFile(`migrations/${file}`, "utf8"))
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await db.prepare(sql).run();
    const login = await request("/api/login", { password: "test-password" });
    expect(login.status).toBe(200);
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    await db
      .prepare("INSERT INTO accounts VALUES('a','Test','@test','#abcdef',0)")
      .run();
  }, 30000);
  afterAll(async () => {
    await mf?.dispose();
    await mock.close();
  });

  it.each(providers)(
    "requires the selected $label credential before generation",
    async (provider) => {
      await select(provider);
      const result = await generate();
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({
        error: `Isi API key ${provider.label} di Settings.`,
      });
      expect(await contentCount()).toBe(0);
    },
  );

  it.each(providers)(
    "generates a persisted draft with $label and keeps its key encrypted",
    async (provider) => {
      const token = `test-only-${provider.id}-secret`;
      await select(provider, { [provider.key]: ` ${token} `.trim() });
      const encrypted = (await db
        .prepare("SELECT encrypted FROM credentials WHERE name=?")
        .bind(provider.key)
        .first<{ encrypted: string }>())!.encrypted;
      expect(encrypted).not.toContain(token);
      expect(await decrypt(encrypted, encryptionKey)).toBe(token);
      let capturedBody: Promise<string> | undefined;
      let headers = new Headers();
      mock
        .get(provider.origin)
        .intercept({ path: provider.path, method: "POST" })
        .reply(200, (opts) => {
          capturedBody = bodyText(opts.body);
          headers = new Headers(opts.headers as Record<string, string>);
          return reply(provider.id);
        });
      const before = await contentCount();
      const result = await generate();
      expect(result.status).toBe(200);
      const item = (await result.json()) as { id: string };
      expect(item).toMatchObject({ ...draft, accountId: "a", status: "draft" });
      expect(await contentCount()).toBe(before + 1);
      const body = JSON.parse(await capturedBody!);
      expect(headers.get("content-type")).toBe("application/json");
      if (provider.id === "gemini") {
        expect(headers.get("x-goog-api-key")).toBe(token);
        expect(headers.has("authorization")).toBe(false);
        expect(body).toMatchObject({
          systemInstruction: {
            parts: [{ text: expect.stringContaining("JSON") }],
          },
          contents: [
            {
              role: "user",
              parts: [
                { text: expect.stringContaining("Rutinitas kreatif pagi") },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 1400,
          },
        });
      } else {
        expect(headers.get("authorization")).toBe(`Bearer ${token}`);
        expect(body).toMatchObject({
          model: provider.model,
          max_tokens: 1400,
          stream: false,
          messages: [
            { role: "system", content: expect.stringContaining("JSON") },
            {
              role: "user",
              content: expect.stringContaining("Rutinitas kreatif pagi"),
            },
          ],
        });
        expect(body.response_format).toEqual(
          provider.jsonMode ? { type: "json_object" } : undefined,
        );
      }
      expect(headers.get("http-referer")).toBe(
        provider.id === "openrouter" ? base : null,
      );
      // An empty key preserves the stored secret; the workspace exposes names only.
      await select(provider, { [provider.key]: "" });
      const workspace = await request("/api/workspace");
      const text = await workspace.text();
      expect(text).not.toContain(token);
      expect(text).not.toContain(encrypted);
      expect(JSON.parse(text).settings).toMatchObject({
        provider: provider.id,
        model: provider.model,
        configured: expect.arrayContaining([provider.key]),
      });
    },
  );

  it.each(providers)(
    "generates and persists UGC stories through $label",
    async (provider) => {
      await select(provider);
      let capturedBody: Promise<string> | undefined;
      mock
        .get(provider.origin)
        .intercept({ path: provider.path, method: "POST" })
        .reply(200, (opts) => {
          capturedBody = bodyText(opts.body);
          return reply(provider.id, JSON.stringify(ugcFixture));
        });
      const brief = {
        ...defaultUGCBrief,
        idea: "Cerita kopi pagi",
        product: "Mug keramik biru",
        sceneDuration: 8,
      };
      const result = await request("/api/contents/generate-ugc", {
        accountId: "a",
        brief,
      });
      expect(result.status).toBe(200);
      const item = (await result.json()) as Content;
      expect(item).toMatchObject({
        title: ugcFixture.title,
        caption: ugcFixture.caption,
        accountId: "a",
        status: "draft",
        ugc: { brief, scenes: ugcFixture.scenes },
      });
      expect(item.prompt).toContain("32 detik");
      const body = JSON.parse(await capturedBody!);
      if (provider.id === "gemini") {
        expect(body.generationConfig.maxOutputTokens).toBe(6000);
        expect(JSON.parse(body.contents[0].parts[0].text)).toMatchObject(brief);
      } else {
        expect(body.max_tokens).toBe(6000);
        expect(JSON.parse(body.messages[1].content)).toMatchObject(brief);
      }
      const saved = await db
        .prepare("SELECT data FROM contents WHERE id=?")
        .bind(item.id)
        .first<{ data: string }>();
      expect(JSON.parse(saved!.data).ugc).toEqual(item.ugc);
      const edited = await request(
        `/api/contents/${item.id}`,
        {
          title: item.title,
          caption: "Caption hasil review",
          prompt: item.prompt,
          expectedRevision: item.revision,
        },
        "PATCH",
      );
      expect(edited.status).toBe(200);
      expect(((await edited.json()) as Content).ugc).toEqual(item.ugc);
    },
  );

  it.each([
    {
      name: "malformed JSON",
      text: "not json",
      error: "Hasil UGC bukan JSON yang valid.",
    },
    {
      name: "missing scene prompts",
      text: JSON.stringify({ title: "Only a title" }),
      error: "Hasil UGC belum lengkap",
    },
    {
      name: "wrong scene count",
      text: JSON.stringify({
        ...ugcFixture,
        scenes: ugcFixture.scenes.slice(0, 3),
      }),
      error: "Jumlah adegan AI tidak sesuai brief",
    },
  ])("rejects UGC $name without creating a draft", async ({ text, error }) => {
    const provider = providers[6];
    await select(provider);
    mock
      .get(provider.origin)
      .intercept({ path: provider.path, method: "POST" })
      .reply(200, reply(provider.id, text));
    const before = await contentCount();
    const result = await request("/api/contents/generate-ugc", {
      accountId: "a",
      brief: { ...defaultUGCBrief, idea: "Cerita kopi pagi" },
    });
    expect(result.status).toBe(400);
    expect(await result.text()).toContain(error);
    expect(await contentCount()).toBe(before);
  });

  it("validates the UGC brief and account before calling AI, and requires authentication", async () => {
    const brief = { ...defaultUGCBrief, idea: "Cerita kopi pagi" };
    for (const invalid of [
      { sceneCount: 2 },
      { sceneCount: 7 },
      { sceneDuration: 6 },
      { character: " " },
      { idea: " " },
    ]) {
      const result = await request("/api/contents/generate-ugc", {
        accountId: "a",
        brief: { ...brief, ...invalid },
      });
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({ error: "Input tidak valid." });
    }
    const missing = await request("/api/contents/generate-ugc", {
      accountId: "missing",
      brief,
    });
    expect(await missing.json()).toEqual({ error: "Pilih akun yang valid." });
    const denied = await mf.dispatchFetch(base + "/api/contents/generate-ugc", {
      method: "POST",
      headers: { Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: "a", brief }),
    });
    expect(denied.status).toBe(401);
  });

  it.each(providers)(
    "reports $label HTTP failures without leaking remote error bodies or saving drafts",
    async (provider) => {
      await select(provider);
      mock
        .get(provider.origin)
        .intercept({ path: provider.path, method: "POST" })
        .reply(429, { error: "remote-sensitive-error" });
      const before = await contentCount();
      const result = await generate();
      expect(result.status).toBe(400);
      const text = await result.text();
      expect(text).toContain(provider.label);
      expect(text).toContain("429");
      expect(text).not.toContain("remote-sensitive-error");
      expect(await contentCount()).toBe(before);
    },
  );

  it.each(providers)(
    "rejects empty $label text without saving a draft",
    async (provider) => {
      await select(provider);
      mock
        .get(provider.origin)
        .intercept({ path: provider.path, method: "POST" })
        .reply(200, reply(provider.id, " "));
      const before = await contentCount();
      const result = await generate();
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({
        error: "AI tidak mengembalikan teks.",
      });
      expect(await contentCount()).toBe(before);
    },
  );

  it.each([
    {
      name: "non-JSON HTTP body",
      response: "<html>upstream error</html>",
      error: "Respons AI bukan JSON yang valid.",
    },
    {
      name: "malformed response shape",
      response: { choices: null },
      error: "AI tidak mengembalikan teks.",
    },
    {
      name: "oversized response",
      response: "x".repeat(1_000_001),
      error: "Respons AI terlalu besar.",
    },
  ])("rejects $name", async ({ response, error }) => {
    const provider = providers[6];
    await select(provider);
    mock
      .get(provider.origin)
      .intercept({ path: provider.path, method: "POST" })
      .reply(200, response);
    const before = await contentCount();
    const result = await generate();
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error });
    expect(await contentCount()).toBe(before);
  });

  it("keeps Cloudflare available and explains a missing AI binding", async () => {
    const settings = await request(
      "/api/settings",
      {
        ...makeDemo().settings,
        provider: "cloudflare",
        model: "@cf/meta/llama-3.1-8b-instruct",
      },
      "PUT",
    );
    expect(settings.status).toBe(200);
    const result = await generate();
    expect(await result.json()).toEqual({
      error: "Binding Workers AI belum dikonfigurasi.",
    });
  });
  it("rejects unknown providers in settings", async () => {
    const result = await request(
      "/api/settings",
      { ...makeDemo().settings, provider: "unknown" },
      "PUT",
    );
    expect(result.status).toBe(400);
  });
});
