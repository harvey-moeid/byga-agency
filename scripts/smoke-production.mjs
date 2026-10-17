import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Point this at a running production bundle, never the Vite development server.
const baseURL = process.env.BYGA_SMOKE_BASE_URL || "http://127.0.0.1:8788";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({ baseURL });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.cspViolations.push({
        directive: event.violatedDirective,
        blocked: event.blockedURI,
      });
    });
  });
  const response = await page.goto("/");
  assert.equal(response.status(), 200);
  const policy = response.headers()["content-security-policy"];
  assert.ok(policy?.includes("frame-ancestors 'none'"));
  assert.ok(!policy.includes("'unsafe-eval'"));
  assert.equal(response.headers()["x-content-type-options"], "nosniff");
  await page
    .locator('[data-avatar][data-model="ready"]')
    .nth(4)
    .waitFor({ timeout: 45000 });
  assert.equal(
    await page.locator('[data-avatar][data-model="ready"]').count(),
    5,
  );
  await page.getByRole("button", { name: "Kalender", exact: true }).click();
  await page.getByRole("heading", { name: "Kalender konten." }).waitFor();
  const ready = await page.request.get("/api/ready");
  assert.equal(ready.status(), 200);
  assert.deepEqual(await ready.json(), { ok: true });
  const script = await page
    .locator('script[type="module"]')
    .getAttribute("src");
  const asset = await page.request.get(script);
  assert.match(asset.headers()["cache-control"], /immutable/);
  assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
  assert.deepEqual(errors, []);
  console.log(
    "Production browser smoke passed: 5 avatars, navigation, CSP, readiness and immutable assets.",
  );
} finally {
  await browser.close();
}
