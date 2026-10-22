import { test, expect } from "@playwright/test";

// REPRO: Boss's phone (2026-10-14 09:13) showed "Something crashed · Error
// creating WebGL context." — UniverseBg is a decorative background, but
// THREE.WebGLRenderer throws inside its useEffect when the browser refuses a
// WebGL context, and the ErrorBoundary replaces the WHOLE app.
// The background must degrade to a solid colour; the app must still render.

test("no WebGL: app still renders, no crash screen", async ({ page }) => {
  await page.goto("http://localhost:5199/universe.html?nowebgl=1");
  await expect(page.locator("#app-ok")).toBeVisible();
  await expect(page.getByText("Something crashed")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
});

// Control — the same harness WITHOUT the override must mount the canvas,
// otherwise the test above would pass on a page that never tried WebGL at all.
test("control: with WebGL the canvas mounts", async ({ page }) => {
  await page.goto("http://localhost:5199/universe.html");
  await expect(page.locator("#app-ok")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
});
