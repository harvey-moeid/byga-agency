import { test, expect, type Page } from "@playwright/test";
// Read the actual rendered skeleton, rather than inferring animation from its UI badge.
async function kneePose(page: Page) {
  return page.evaluate(async () => {
    const source = await (await fetch("/src/Office.tsx")).text();
    const moduleUrl = source.match(
      /from\s+"([^"]*react-three_fiber[^\"]+)"/,
    )![1];
    const { _roots } = await import(moduleUrl);
    const scene = _roots
      .get(document.querySelector("canvas"))
      .store.getState().scene;
    return scene
      .getObjectByName("agent-nova")
      .getObjectByName("Bip01_L_Calf")
      .quaternion.toArray() as number[];
  });
}
test("human avatars load, work, walk through doors and pause", async ({
  page,
}) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator('[data-avatar][data-model="ready"]')).toHaveCount(
    5,
    { timeout: 30000 },
  );
  await expect(page.locator('[data-avatar="Nova"]')).toHaveAttribute(
    "data-animation",
    "Type",
  );
  await expect(page.locator('[data-avatar="Aria"]')).toHaveAttribute(
    "data-animation",
    "Read",
  );
  await page.getByRole("button", { name: "Riset", exact: true }).click();
  const presence = page.getByTestId("avatar-presence");
  await expect(presence).toHaveAttribute("data-destination", "research");
  await expect(presence).toHaveAttribute("data-animation", "Walk");
  const firstKnee = await kneePose(page);
  await expect
    .poll(async () =>
      Math.max(
        ...(await kneePose(page)).map((v, i) => Math.abs(v - firstKnee[i])),
      ),
    )
    .toBeGreaterThan(0.01);
  await expect(presence).toHaveAttribute("data-room", "research", {
    timeout: 30000,
  });
  await expect(presence).toHaveAttribute("data-animation", "Read");
  await page.getByRole("button", { name: "Jeda animasi", exact: true }).click();
  await expect(presence).toContainText("Dijeda");
  const pausedKnee = await kneePose(page);
  await page.waitForTimeout(350);
  expect(
    Math.max(
      ...(await kneePose(page)).map((v, i) => Math.abs(v - pausedKnee[i])),
    ),
  ).toBeLessThan(0.0001);
  await page
    .getByRole("button", { name: "Aktifkan animasi", exact: true })
    .click();
  await expect(presence).toContainText("Meninjau referensi");
  expect(errors).toEqual([]);
});
test("reduced motion starts paused and a broken avatar model preserves the office", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/avatars/nova.glb", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Aktifkan animasi", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-avatar="Nova"]')).toHaveAttribute(
    "data-model",
    "fallback",
    { timeout: 30000 },
  );
  await expect(page.locator(".room-label")).toHaveCount(5);
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Kalender konten." }),
  ).toBeVisible();
});
