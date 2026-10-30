import { createProject, defaultAgents } from "../../src/studio";
import { makeDemo } from "../../src/domain";
import { defaultUGCBrief } from "../../src/ugc";
import { test, expect, type Page } from "@playwright/test";
test.use({ actionTimeout: 10000 });
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOcQAAAAASUVORK5CYII=",
  "base64",
);
async function navigate(page: Page, name = "Creative Prompt Studio") {
  if ((page.viewportSize()?.width || 1440) <= 760)
    await page
      .getByRole("button", { name: "Buka navigasi", exact: true })
      .click();
  await page
    .locator(".sidebar")
    .getByRole("button", {
      name: name === "Content library" ? /Content library/ : name,
      exact: name !== "Content library",
    })
    .click();
}
async function create(page: Page) {
  await page.goto("/");
  await navigate(page);
  await page
    .getByRole("button", { name: "Buat proyek Creative", exact: true })
    .click();
  await page
    .getByLabel("Ide utama", { exact: true })
    .fill("Ritual kopi pagi kreator Indonesia");
  await page.getByRole("button", { name: "Simpan brief", exact: true }).click();
  await expect(page.getByText("Ada perubahan belum disimpan")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Susun storyboard template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate All Prompts", exact: true })
    .click();
}
async function step(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Tahapan Creative Studio" })
    .getByRole("button", { name })
    .click();
}
test("Creative templates, manual imports, revision recovery, exports and Content Library work end to end", async ({
  page,
}) => {
  test.setTimeout(90000);
  let calls = 0;
  await page.route("**/api/**", (route) => {
    calls++;
    return route.abort();
  });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await create(page);
  await expect(
    page.getByText("5 scene · 30 detik", { exact: false }),
  ).toBeVisible();
  await step(page, "Image Prompt Builder");
  await expect(page.getByLabel("Edit image prompt")).toHaveValue(
    /Create one 9:16 still image/,
  );
  await page
    .getByLabel("Edit image prompt")
    .fill("Edited visual: creator holding a blue mug in natural daylight.");
  await page.getByRole("button", { name: "Save Prompt", exact: true }).click();
  await page
    .getByRole("button", { name: "Copy Image Prompt", exact: true })
    .first()
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Edited visual");
  const txt = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export Prompt TXT", exact: true })
    .click();
  expect((await txt).suggestedFilename()).toMatch(/image.txt$/);
  await step(page, "Image Asset Manager");
  await page
    .getByLabel("Upload first", { exact: true })
    .setInputFiles({ name: "chatgpt.png", mimeType: "image/png", buffer: png });
  await expect(page.locator(".creative-asset-slot img").first()).toBeVisible();
  await step(page, "Video Prompt Builder");
  await page
    .getByRole("combobox", { name: "Preset camera movement", exact: true })
    .selectOption("Static Shot");
  await page.getByRole("button", { name: "Save Scene", exact: true }).click();
  await page
    .getByRole("button", { name: "Regenerate Prompt", exact: true })
    .click();
  await expect(page.getByLabel("Edit video prompt")).toHaveValue(
    /Keep the camera fixed/,
  );
  await step(page, "Video Asset Manager");
  await page
    .getByLabel("Upload video", { exact: true })
    .setInputFiles("tests/fixtures/sample.mp4");
  await expect(page.locator(".creative-asset-slot video")).toBeVisible();
  await page
    .getByRole("button", { name: "Approve Scene", exact: true })
    .click();
  // Reuse uploaded files in the remaining scenes, exercising scene-local writes.
  for (let i = 1; i < 5; i++) {
    await page.locator(".creative-timeline button").nth(i).click();
    await step(page, "Image Asset Manager");
    const imageId = await page
      .getByLabel("Aset tersimpan first", { exact: true })
      .locator("option")
      .nth(1)
      .getAttribute("value");
    await page
      .getByLabel("Aset tersimpan first", { exact: true })
      .selectOption(imageId!);
    await step(page, "Video Prompt Builder");
    await page
      .getByRole("button", { name: "Regenerate Prompt", exact: true })
      .click();
    await step(page, "Video Asset Manager");
    const videoId = await page
      .getByLabel("Aset tersimpan video", { exact: true })
      .locator("option")
      .nth(1)
      .getAttribute("value");
    await page
      .getByLabel("Aset tersimpan video", { exact: true })
      .selectOption(videoId!);
    await page
      .getByRole("button", { name: "Approve Scene", exact: true })
      .click();
  }
  await expect(page.getByText("5/5 disetujui", { exact: false })).toBeVisible();
  await step(page, "Review & Export");
  const json = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export Storyboard JSON", exact: true })
    .click();
  expect((await json).suggestedFilename()).toMatch(/storyboard.json$/);
  await page
    .getByRole("button", {
      name: "Kirim draft ke Content Library",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Draft terakhir:", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await navigate(page);
  await expect(page.locator(".creative-timeline button")).toHaveCount(5);
  await expect(page.getByText("5/5 disetujui", { exact: false })).toBeVisible();
  await navigate(page, "Content library");
  await expect(
    page.getByText("Konten TikTok 30 detik", { exact: true }).first(),
  ).toBeVisible();
  expect(calls).toBeLessThanOrEqual(1); // Initial health probe only; template generation never calls AI.
});
for (const width of [320, 360, 390, 430])
  test(`Creative stages and legacy navigation fit ${width}px and preserve unsaved edits`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    await create(page);
    await page
      .getByRole("textbox", { name: "Narasi", exact: true })
      .fill("Draft narasi yang belum disimpan");
    for (const title of [
      "Image Prompt Builder",
      "Image Asset Manager",
      "Video Prompt Builder",
      "Video Asset Manager",
      "Review & Export",
      "Brief & Storyboard",
    ]) {
      await step(page, title);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
    }
    await expect(
      page.getByRole("textbox", { name: "Narasi", exact: true }),
    ).toHaveValue("Draft narasi yang belum disimpan");
    await page.getByRole("button", { name: "Save Scene", exact: true }).click();
    await page.reload();
    await navigate(page);
    await expect(
      page.getByRole("textbox", { name: "Narasi", exact: true }),
    ).toHaveValue("Draft narasi yang belum disimpan");
    await navigate(page, "Prompt UGC");
    await expect(page.getByLabel("Ide cerita UGC")).toBeVisible();
    await navigate(page, "Workspace");
    await expect(
      page.getByRole("heading", { name: "Ide besar, tim yang siap." }),
    ).toBeVisible();
  });

test("explicit conversion preserves the legacy UGC project and its original duration", async ({
  page,
}) => {
  const legacy = createProject("Legacy 5s", makeDemo().accounts[0].id, {
    ...defaultUGCBrief,
    idea: "Cerita kopi legacy tetap tersimpan",
    sceneCount: 3,
  });
  await page.addInitScript(
    ({ legacy, agents }) => {
      if (!localStorage.getItem("byga-studio-v1")) {
        localStorage.setItem(
          "byga-studio-v1",
          JSON.stringify({ projects: [legacy], characters: [], agents }),
        );
        localStorage.setItem("byga-studio-active-demo", legacy.id);
      }
    },
    { legacy, agents: defaultAgents },
  );
  await page.goto("/");
  await navigate(page);
  await expect(
    page.getByText("Durasi asli 5 detik tetap disimpan.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Durasi konversi scene", exact: true })
    .selectOption("10");
  await page
    .getByRole("button", {
      name: "Konversi eksplisit ke Creative Studio",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("3 scene · 30 detik", { exact: false }),
  ).toBeVisible();
  await navigate(page, "Proyek UGC");
  await expect(page.getByLabel("Ide dan tujuan cerita")).toHaveValue(
    "Cerita kopi legacy tetap tersimpan",
  );
  const saved = await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("byga-studio-v1")!).projects.find(
        (p: { id: string }) => p.id === id,
      ),
    legacy.id,
  );
  expect(saved.briefDraft.sceneDuration).toBe(5);
  expect(
    saved.creative.scenes.every((s: { duration: number }) => s.duration === 10),
  ).toBe(true);
  await expect(
    page
      .locator(".studio-project-list")
      .getByRole("button", { name: /Legacy 5s/ }),
  ).toBeVisible();
});
