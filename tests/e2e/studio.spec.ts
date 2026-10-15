import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function createProject(page: Page, name = "Cerita kopi pagi") {
  await page.goto("/");
  await page.getByRole("button", { name: "Proyek UGC", exact: true }).click();
  await page.getByRole("button", { name: "Proyek baru", exact: true }).click();
  await page.getByLabel("Nama proyek", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Mulai proyek", exact: true }).click();
  await page
    .getByRole("button", { name: "Tutup percakapan", exact: true })
    .click();
  await page
    .getByLabel("Ide dan tujuan cerita")
    .fill(
      "Cerita pekerja remote yang belajar menikmati kopi pagi dengan tenang.",
    );
  await page.getByLabel("Jumlah adegan proyek").selectOption("3");
  await page
    .getByRole("button", { name: "Pratinjau & ajukan brief", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Setujui Brief", exact: true })
    .click();
}
async function step(
  page: Page,
  agent: string,
  action: string,
  approval: string,
) {
  const panel = page.locator(".studio-agent-panel");
  await panel
    .locator(".studio-agent-switch")
    .getByRole("button", { name: agent, exact: true })
    .click();
  await panel.getByRole("button", { name: action, exact: true }).click();
  await panel.getByRole("button", { name: approval, exact: true }).click();
}
test("projects approve every UGC stage, preserve history and revise one scene without overwriting content", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await createProject(page);
  const originalCount = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("byga-workspace-v1")!).contents.length,
  );
  const panel = page.locator(".studio-agent-panel");
  await expect(
    panel.getByRole("button", { name: "Buat prompt gambar", exact: true }),
  ).toBeDisabled();
  await step(page, "Nova", "Buat cerita", "Setujui Cerita & naskah");
  await step(page, "Kai", "Buat prompt gambar", "Setujui Prompt gambar");
  await step(page, "Leo", "Buat prompt video", "Setujui Prompt video");
  await step(page, "Iris", "Review proyek", "Setujui Review akhir");
  await panel
    .getByRole("button", { name: "Pratinjau draft final", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Setujui Draft final", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("byga-workspace-v1")!).contents.length,
    ),
  ).toBe(originalCount);
  await panel
    .getByRole("button", { name: "Setujui Draft final", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("byga-workspace-v1")!).contents
            .length,
      ),
    )
    .toBe(originalCount + 1);
  await panel
    .locator(".studio-agent-switch")
    .getByRole("button", { name: "Nova", exact: true })
    .click();
  await panel.getByLabel("Cakupan revisi", { exact: true }).selectOption("s2");
  await panel
    .getByLabel("Pesan untuk agen", { exact: true })
    .fill("Revisi adegan kedua: tambahkan momen tenang sebelum mulai bekerja.");
  await panel.getByRole("button", { name: "Buat cerita", exact: true }).click();
  await panel
    .getByRole("button", { name: "Setujui Cerita & naskah", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Tutup percakapan", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hasil per adegan", exact: true })
    .click();
  const scenes = page.locator(".studio-result-scene");
  await expect(scenes).toHaveCount(3);
  await expect(
    scenes.nth(1).getByText("Perlu ditinjau ulang", { exact: true }),
  ).toHaveCount(2);
  await expect(
    scenes.nth(0).getByText("Disetujui", { exact: true }),
  ).toHaveCount(2);
  await scenes.nth(1).getByRole("button", { name: "Revisi adegan" }).click();
  await expect(page.getByLabel("Cakupan revisi", { exact: true })).toHaveValue(
    "s2",
  );
  await page
    .getByRole("button", { name: "Tutup percakapan", exact: true })
    .click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: "Unduh proyek & riwayat (.json)",
      exact: true,
    })
    .click();
  const backup = await downloadEvent;
  const exported = JSON.parse(await readFile((await backup.path())!, "utf8"));
  expect(exported.history).toHaveLength(7);
  expect(exported.final.contentId).toBeTruthy();
  await page
    .getByRole("button", { name: "Riwayat versi", exact: true })
    .click();
  await expect(page.locator(".studio-version-history > details")).toHaveCount(
    7,
  );
  await page.reload();
  await page.getByRole("button", { name: "Proyek UGC", exact: true }).click();
  await expect(page.getByLabel("Ide dan tujuan cerita")).toHaveValue(
    /pekerja remote/,
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("byga-workspace-v1")!).contents.length,
    ),
  ).toBe(originalCount + 1);
  expect(errors).toEqual([]);
});

test("agent presets and custom names persist in office labels, with separate conversations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settings = page.locator(".studio-agent-settings");
  await settings.getByLabel("Nama agen", { exact: true }).fill("Nara");
  await settings
    .getByLabel("Preset instruksi", { exact: true })
    .selectOption("reviewer");
  await expect(
    settings.getByLabel("Instruksi agen", { exact: true }),
  ).toHaveValue(/Periksa kesinambungan/);
  await settings
    .getByLabel("Instruksi agen", { exact: true })
    .fill(
      "Tulis dengan bahasa Indonesia yang hangat, natural dan ringkas. Selalu tanyakan konteks yang belum jelas.",
    );
  await settings
    .getByRole("button", { name: "Simpan agen", exact: true })
    .click();
  await expect(settings.getByText("Pengaturan agen tersimpan.")).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".team-member").filter({ hasText: "Nara" }),
  ).toBeVisible();
  await page.locator(".team-member").filter({ hasText: "Nara" }).click();
  await expect(
    page.getByRole("dialog", { name: "Nara · AI teammate" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tutup percakapan", exact: true })
    .click();
  await createProject(page, "Percakapan terpisah");
  const panel = page.locator(".studio-agent-panel");
  await panel
    .locator(".studio-agent-switch")
    .getByRole("button", { name: "Nara", exact: true })
    .click();
  await panel
    .getByLabel("Pesan untuk agen", { exact: true })
    .fill("Saya ingin hook pembuka yang terasa hangat.");
  await panel.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(panel.locator(".studio-message.assistant").last()).toContainText(
    "hook pembuka",
  );
  await panel
    .locator(".studio-agent-switch")
    .getByRole("button", { name: "Kai", exact: true })
    .click();
  await expect(panel.locator(".studio-message")).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Buat cerita", exact: true }),
  ).toBeEnabled();
});

test("mobile agent chat fills the screen and cancellation keeps the user message without applying late results", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createProjectMobile(page);
  const panel = page.locator(".studio-agent-panel");
  const box = await panel.boundingBox();
  expect(box?.width).toBe(390);
  await panel
    .getByLabel("Pesan untuk agen", { exact: true })
    .fill("Tolong pikirkan ide cerita yang relatable.");
  await panel.getByRole("button", { name: "Kirim", exact: true }).click();
  await panel
    .getByRole("button", { name: "Hentikan generasi", exact: true })
    .click();
  await expect(panel).toContainText("Generasi dihentikan");
  await expect(panel.locator(".studio-message.user")).toContainText(
    "ide cerita yang relatable",
  );
  await expect(panel.locator(".studio-thinking")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/byga-studio-chat-mobile.png" });
  await panel
    .getByRole("button", { name: "Tutup percakapan", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
async function createProjectMobile(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Proyek baru", exact: true }).click();
  await page.getByLabel("Nama proyek", { exact: true }).fill("Cerita mobile");
  await page.getByRole("button", { name: "Mulai proyek", exact: true }).click();
  await expect(page.locator(".studio-agent-panel")).toBeVisible();
}

test("brief autosave survives quick navigation and character reference profiles persist", async ({
  page,
}) => {
  await createProject(page, "Profil karakter tersimpan");
  await page
    .getByRole("button", { name: "Tutup percakapan", exact: true })
    .click();
  const updated =
    "Perubahan brief yang harus tersimpan meski langsung pindah halaman.";
  await page.getByLabel("Ide dan tujuan cerita").fill(updated);
  await page.getByRole("button", { name: /Content library/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("byga-studio-v1")!).projects[0]
            .briefDraft.idea,
      ),
    )
    .toBe(updated);
  await page.getByRole("button", { name: "Proyek UGC", exact: true }).click();
  await page
    .getByRole("button", { name: "Karakter cerita", exact: true })
    .click();
  const editor = page.locator(".studio-character-editor");
  await editor.getByLabel("Nama karakter cerita").fill("Ayu");
  await editor
    .getByLabel("Penampilan karakter")
    .fill("Kreator dewasa Indonesia berambut hitam sebahu.");
  await editor
    .getByLabel("Pakaian karakter")
    .fill("Kaus krem dan celana linen coklat");
  await editor.locator("input[type=file]").setInputFiles({
    name: "referensi-ayu.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOcQAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await editor
    .getByRole("button", { name: "Simpan profil karakter", exact: true })
    .click();
  await expect(editor.getByText("Profil karakter tersimpan.")).toBeVisible();
  await page.getByRole("button", { name: "Brief", exact: true }).click();
  await page
    .getByLabel("Gunakan karakter tersimpan")
    .selectOption({ label: "Ayu" });
  await expect(page.getByLabel("Deskripsi karakter proyek")).toHaveValue(
    /Kaus krem dan celana linen coklat/,
  );
  await page.getByRole("button", { name: "Simpan brief", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Proyek UGC", exact: true }).click();
  await expect(page.getByLabel("Deskripsi karakter proyek")).toHaveValue(
    /berambut hitam sebahu/,
  );
  const profile = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("byga-studio-v1")!).projects[0].briefDraft
        .characterProfile,
  );
  expect(profile.referenceAssetId).toBeTruthy();
  await page.getByRole("button", { name: "File manager", exact: true }).click();
  await page
    .getByRole("button", { name: "Hapus file referensi-ayu.png", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Gambar masih digunakan",
  );
});
