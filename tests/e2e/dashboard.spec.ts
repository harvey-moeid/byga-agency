import { test, expect } from "@playwright/test";
import { makeDemo } from "../../src/domain";
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
  await dialog
    .getByLabel("Caption", { exact: true })
    .fill("Caption final yang akan disetujui");
  await expect(
    dialog.getByRole("button", { name: "Approve konten" }),
  ).toBeDisabled();
  await expect(dialog.getByText(/Ada edit yang belum tersimpan/)).toBeVisible();
  await dialog.getByRole("button", { name: "Simpan edit" }).click();
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
    "Caption final yang akan disetujui",
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
  await expect(page.locator('[data-office-quality="light"]')).toBeVisible({
    timeout: 15000,
  });
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

test("mobile users can reschedule from the detail form and keep the result after reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await page
    .locator(".schedule-row")
    .filter({ hasText: "A little reset for your busy day" })
    .click();
  await page
    .getByLabel("Waktu posting (Asia/Jakarta)")
    .fill("2030-02-01T10:00");
  await page.getByRole("button", { name: "Ubah jadwal", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Perubahan tersimpan" }),
  ).toBeVisible();
  await page.reload();
  const scheduled = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("byga-workspace-v1")!).contents.find(
        (c: { id: string }) => c.id === "c2",
      ).scheduledAt,
  );
  expect(scheduled).toBe("2030-02-01T03:00:00.000Z");
});

test("live login loads the saved settings and an expired session returns to login", async ({
  page,
}) => {
  const workspace = {
    ...makeDemo(),
    accounts: [],
    contents: [],
    assets: [],
    activity: [],
    competitors: [],
    settings: {
      provider: "cloudflare",
      model: "@cf/meta/llama-3.1-8b-instruct",
      retentionMonths: 6,
      timezone: "UTC",
      automaticDrafts: false,
      notification: "none",
    },
  };
  let authenticated = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/login") {
      authenticated = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (path === "/api/workspace" && authenticated)
      return route.fulfill({ json: workspace });
    return route.fulfill({ status: 401, json: { error: "Sesi kedaluwarsa." } });
  });
  await page.goto("/?mode=live");
  await page.getByLabel("Password dashboard").fill("test-password");
  await page
    .getByRole("button", { name: "Masuk workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Provider AI", exact: true }),
  ).toHaveValue("cloudflare");
  await expect(
    page.getByRole("combobox", { name: "Zona waktu", exact: true }),
  ).toHaveValue("UTC");
  await expect(
    page.getByRole("combobox", {
      name: "Retensi activity history",
      exact: true,
    }),
  ).toHaveValue("6");
  await page
    .getByRole("button", { name: "Simpan settings", exact: true })
    .click();
  await expect(page.getByLabel("Password dashboard")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Sesi kedaluwarsa");
  expect(
    await page.evaluate(() => localStorage.getItem("byga-workspace-v1")),
  ).toBeNull();
});

test("a late live response cannot replace or persist the demo workspace", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const responseReady = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requestStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  await page.route("**/api/workspace", async (route) => {
    requestStarted?.();
    await responseReady;
    await route.fulfill({
      json: {
        ...makeDemo(),
        accounts: [
          {
            id: "remote",
            name: "Remote only",
            handle: "@remote",
            color: "#ffffff",
            connected: false,
          },
        ],
      },
    });
  });
  await page.goto("/?mode=live");
  await started;
  await page.getByRole("button", { name: "Jelajahi mode demo" }).click();
  const response = page.waitForResponse("**/api/workspace");
  release?.();
  await response;
  await expect(
    page.getByRole("heading", { name: "Ide besar, tim yang siap." }),
  ).toBeVisible();
  await expect(page.getByText("Remote only", { exact: true })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("byga-workspace-v1")!).accounts[0].id,
      ),
    )
    .toBe("a1");
});

test("saving a new live caption clears the consent given for the previous revision", async ({
  page,
}) => {
  const demo = makeDemo();
  let item = { ...demo.contents[0], fileId: "live-video", revision: 0 };
  let revisionReceived: number | undefined;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/workspace")
      return route.fulfill({
        json: {
          ...demo,
          accounts: [{ ...demo.accounts[0], connected: true }],
          contents: [item],
        },
      });
    if (path === "/api/files/live-video")
      return route.fulfill({
        path: "tests/fixtures/sample.mp4",
        contentType: "video/mp4",
      });
    if (path === "/api/accounts/a1/creator")
      return route.fulfill({
        json: {
          creator_nickname: "Test Creator",
          creatorId: "creator-one",
          privacy_level_options: ["SELF_ONLY"],
          comment_disabled: false,
          duet_disabled: false,
          stitch_disabled: false,
          max_video_post_duration_sec: 60,
        },
      });
    if (path === "/api/contents/c1" && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      revisionReceived = body.expectedRevision;
      item = {
        ...item,
        title: body.title,
        caption: body.caption,
        prompt: body.prompt,
        revision: item.revision + 1,
      };
      return route.fulfill({ json: item });
    }
    return route.fulfill({
      status: 404,
      json: { error: "Unexpected test request" },
    });
  });
  await page.goto("/?mode=live");
  await page.getByRole("button", { name: /Content library/ }).click();
  await page.locator(".content-card").click();
  const privacy = page.getByRole("combobox", {
    name: "Siapa yang dapat melihat?",
  });
  await privacy.selectOption("SELF_ONLY");
  await page.getByRole("checkbox", { name: /Saya memiliki izin/ }).check();
  await page.getByRole("checkbox", { name: /Saya menyetujui Music/ }).check();
  await page.getByRole("checkbox", { name: /Saya mengizinkan konten/ }).check();
  await expect(
    page.getByRole("button", { name: "Approve konten" }),
  ).toBeEnabled();
  await page
    .getByLabel("Caption", { exact: true })
    .fill("Caption yang berubah setelah consent");
  await expect(
    page.getByRole("button", { name: "Approve konten" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Simpan edit" }).click();
  await expect(privacy).toHaveValue("");
  await expect(
    page.getByRole("checkbox", { name: /Saya mengizinkan konten/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Approve konten" }),
  ).toBeDisabled();
  expect(revisionReceived).toBe(0);
  expect(item.revision).toBe(1);
});
