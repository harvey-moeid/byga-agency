import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { makeDemo, type Content } from "../../src/domain";
import { defaultAgents } from "../../src/studio";
import { defaultUGCBrief, ugcDraft } from "../../src/ugc";
import { ugcFixture } from "../fixtures/ugc";

test("UGC demo persists a storyboard, copies complete prompts, downloads and reuses its brief", async ({
  page,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  let aiCalls = 0;
  await page.route("**/api/contents/generate-ugc", async (route) => {
    aiCalls++;
    await route.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Prompt UGC", exact: true }).click();
  await page
    .getByLabel("Ide cerita UGC")
    .fill("Cerita ritual kopi pagi sebelum bekerja");
  await page
    .getByLabel("Produk / brand (opsional)")
    .fill("Mug keramik biru, tanpa klaim kesehatan");
  await page.getByLabel("Jumlah adegan").selectOption("6");
  await page.getByLabel("Durasi per adegan").selectOption("8");
  await page.getByRole("button", { name: "Buat storyboard demo" }).click();
  const dialog = page.getByRole("dialog");
  const story = dialog.getByRole("region", {
    name: "Storyboard UGC",
    exact: true,
  });
  await expect(story.getByRole("article")).toHaveCount(6);
  await expect(story).toContainText("48 detik total");
  await expect(
    story.getByLabel("Text-to-image · adegan 1", { exact: true }),
  ).toHaveValue(/Character continuity:.*Kreator dewasa/);
  await expect(
    story.getByLabel("Image-to-video · adegan 1", { exact: true }),
  ).toHaveValue(/as the first frame.*8 seconds/);
  await story
    .getByRole("button", { name: "Salin prompt gambar 1", exact: true })
    .click();
  const imagePrompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(imagePrompt).toContain("Character continuity:");
  expect(imagePrompt).toContain("Negative prompt:");
  await story
    .getByRole("button", { name: "Salin semua prompt", exact: true })
    .click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "ADEGAN 6 · 40–48 detik",
  );
  const downloadEvent = page.waitForEvent("download");
  await story
    .getByRole("button", { name: "Unduh storyboard", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^ugc-story-.*\.txt$/);
  const text = await readFile((await download.path())!, "utf8");
  expect(text.match(/TEXT TO IMAGE/g)).toHaveLength(6);
  expect(text.match(/IMAGE TO VIDEO/g)).toHaveLength(6);
  await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /^Content library/ }).click();
  await page
    .getByRole("button", { name: /UGC · Cerita ritual kopi pagi/ })
    .click();
  await expect(story.getByRole("article")).toHaveCount(6);
  await dialog
    .getByRole("button", { name: "Generate versi baru", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("Ide cerita UGC")).toHaveValue(
    "Cerita ritual kopi pagi sebelum bekerja",
  );
  await expect(page.getByLabel("Jumlah adegan")).toHaveValue("6");
  expect(aiCalls).toBe(0);
});

test("UGC generator and scene prompts fit on a mobile screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("button", { name: "Prompt UGC", exact: true }).click();
  await page
    .getByLabel("Ide cerita UGC")
    .fill("Belajar menjalani rutinitas baru");
  await page.getByLabel("Jumlah adegan").selectOption("3");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Buat storyboard demo" }).click();
  const story = page.getByRole("region", {
    name: "Storyboard UGC",
    exact: true,
  });
  await expect(story.getByRole("article")).toHaveCount(3);
  await story
    .getByRole("button", { name: "Salin prompt video 3", exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
  ).toBe(true);
  await expect(
    story.getByLabel("Image-to-video · adegan 3", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/byga-ugc-mobile.png" });
});

test("live UGC keeps the brief after failure and displays the saved backend story", async ({
  page,
}) => {
  const workspace = makeDemo();
  workspace.contents = [];
  const accountId = workspace.accounts[0].id;
  let attempts = 0;
  let submitted:
    { accountId: string; brief: typeof defaultUGCBrief } | undefined;
  let item: Content | undefined;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/studio")
      return route.fulfill({
        json: { agents: defaultAgents, characters: [], projects: [] },
      });
    if (path === "/api/workspace") return route.fulfill({ json: workspace });
    if (path === "/api/contents/generate-ugc") {
      attempts++;
      submitted = route.request().postDataJSON();
      if (attempts === 1)
        return route.fulfill({
          status: 400,
          json: { error: "Provider sedang sibuk. Coba lagi." },
        });
      item = ugcDraft(accountId, submitted!.brief, ugcFixture);
      workspace.contents = [item];
      return route.fulfill({ json: item });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected request" },
    });
  });
  await page.goto("/?mode=live");
  await page.getByRole("button", { name: "Prompt UGC", exact: true }).click();
  await page.getByLabel("Ide cerita UGC").fill("Cerita kopi pagi");
  await page
    .getByRole("button", { name: "Generate storyboard UGC", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Provider sedang sibuk");
  await expect(page.getByLabel("Ide cerita UGC")).toHaveValue(
    "Cerita kopi pagi",
  );
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("button", { name: "Generate storyboard UGC", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: ugcFixture.title,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  expect(submitted).toMatchObject({
    accountId,
    brief: { idea: "Cerita kopi pagi", sceneCount: 4, sceneDuration: 5 },
  });
  await expect(dialog.getByRole("article")).toHaveCount(4);
  await expect(
    dialog.getByLabel("Text-to-image · adegan 1", { exact: true }),
  ).toHaveValue(/blue ceramic mug/);
  await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Cerita UGC tersimpan" }),
  ).toContainText(ugcFixture.title);
  expect(attempts).toBe(2);
});
