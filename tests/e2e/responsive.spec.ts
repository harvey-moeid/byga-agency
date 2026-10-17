import { test, expect } from "@playwright/test";

const pages = [
  "Workspace",
  "Proyek UGC",
  "Riset & inspirasi",
  "Content library",
  "Prompt UGC",
  "Kalender",
  "Publishing",
  "Analytics",
  "File manager",
  "Settings",
];
for (const width of [320, 390, 768, 1440]) {
  test(`all ten pages fit a ${width}px viewport`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const name of pages) {
      if (width <= 760)
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
      await expect(page.locator("main h1")).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
          message: `${name} overflows at ${width}px`,
        })
        .toBeLessThanOrEqual(width);
      if (width <= 760) {
        await expect(page.locator(".mobile-bottom-nav")).toBeVisible();
        expect(
          await page
            .locator(".mobile-bottom-nav button")
            .first()
            .evaluate((element) => element.getBoundingClientRect().height),
        ).toBeGreaterThanOrEqual(44);
      }
    }
    expect(errors).toEqual([]);
  });
}

test("mobile drawer contains focus, restores scrolling and supports Escape and the backdrop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu lainnya" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigasi workspace" });
  await expect(drawer).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tutup navigasi", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(
    await page
      .locator(".sidebar")
      .evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Menu lainnya" }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page
    .locator(".navigation-backdrop")
    .click({ position: { x: 380, y: 400 } });
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.getByRole("button", { name: "Buka konten", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-page", "content");
  const search = page.getByRole("searchbox", {
    name: "Cari konten di library",
  });
  await search.fill("3 tools AI");
  await expect(page.locator(".content-card")).toHaveCount(1);
  await search.fill("");
  await expect(page.locator(".content-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Buka kreasi", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-page", "ugc");
});
