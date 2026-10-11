import { test, expect } from "@playwright/test";
test("demo creates a draft, preserves edits, requires a video, then schedules approval", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ide besar, tim yang siap." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Buat konten", exact: true }).click();
  await page
    .getByLabel("Topik atau creative brief")
    .fill("Rutinitas kreatif pagi hari");
  await page.getByRole("button", { name: "Buat draft demo" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Rutinitas kreatif pagi hari" }),
  ).toBeVisible();
  await dialog
    .getByLabel("Caption", { exact: true })
    .fill("Caption yang telah direview");
  await dialog.getByRole("button", { name: "Simpan edit" }).click();
  await dialog
    .locator("input[type=file]")
    .setInputFiles("tests/fixtures/sample.mp4");
  await expect(dialog.locator("video")).toBeVisible();
  await expect
    .poll(() =>
      dialog.locator("video").evaluate((v) => (v as HTMLVideoElement).duration),
    )
    .toBeGreaterThan(0);
  await expect(
    dialog.getByRole("button", { name: "Approve konten" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Approve konten" }).click();
  await dialog
    .getByLabel("Waktu posting (Asia/Jakarta)")
    .fill("2030-01-01T09:00");
  await dialog.getByRole("button", { name: "Jadwalkan konten" }).click();
  await expect(dialog.getByText("Terjadwal", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "Periksa kesiapan publish" })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Mode demo tidak mengirim konten ke TikTok" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: /Content library/ }).click();
  await page.getByLabel("Cari konten").fill("Rutinitas kreatif pagi hari");
  await page.locator(".content-card").click();
  await expect(page.getByLabel("Caption", { exact: true })).toHaveValue(
    "Caption yang telah direview",
  );
  await expect(
    page.getByRole("dialog").getByText("Terjadwal", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Kembalikan ke draft" }).click();
  await expect(
    page.getByRole("dialog").getByText("Draft", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Jadwalkan konten" }),
  ).toHaveCount(0);
});
test("references and multiple accounts can be managed from the UI", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tambah akun", exact: true }).click();
  await page.getByLabel("Nama akun").fill("Test Studio");
  await page.getByLabel("Username TikTok").fill("@teststudio");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tambah akun" })
    .click();
  await expect(
    page.getByRole("button", { name: "@teststudio Belum terhubung" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Riset & inspirasi" }).click();
  await page.getByLabel("Username kompetitor").fill("@reference");
  await page.getByRole("button", { name: "Tambah referensi" }).click();
  await expect(page.getByText("@reference", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hapus @reference" }).click();
  await expect(page.getByText("@reference", { exact: true })).toHaveCount(0);
});
test("mobile layout has no horizontal overflow and navigation works", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Ide besar, tim yang siap." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kalender konten." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("room controls open the right workspace and agents show their logs", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".room-label")).toHaveCount(5);
  await page.getByRole("button", { name: "Riset", exact: true }).click();
  await expect(
    page.locator(".room-popover").getByRole("heading", { name: "Ruang Riset" }),
  ).toBeVisible();
  await page
    .locator(".room-popover")
    .getByRole("button", { name: "Buka ruang" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Riset & inspirasi." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await page
    .getByRole("button", { name: "Nova Creating Content creator" })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Nova · AI teammate" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("calendar drag-and-drop persists a new schedule in the selected timezone", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await page.getByRole("button", { name: "Minggu berikutnya →" }).click();
  const row = page
    .locator(".schedule-row")
    .filter({ hasText: "A little reset for your busy day" });
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await row.dispatchEvent("dragstart", { dataTransfer });
  await page
    .locator(".calendar-day")
    .nth(3)
    .dispatchEvent("dragover", { dataTransfer });
  await page
    .locator(".calendar-day")
    .nth(3)
    .dispatchEvent("drop", { dataTransfer });
  await expect(
    page
      .locator(".calendar-day")
      .nth(3)
      .getByText("A little reset for your busy day"),
  ).toBeVisible();
  await page.reload();
  const item = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("byga-workspace-v1")!).contents.find(
      (c: { id: string }) => c.id === "c2",
    ),
  );
  expect(item.status).toBe("scheduled");
  expect(Date.parse(item.scheduledAt)).toBeGreaterThan(
    Date.now() + 6 * 86400000,
  );
});
