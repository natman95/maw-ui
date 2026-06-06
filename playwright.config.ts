import { defineConfig, devices } from "@playwright/test";

// Mobile-touch repro for the dashboard terminal "drag-up bounces back to
// bottom" bug. Pixel 7 descriptor → isMobile:true, hasTouch:true, phone
// viewport. Spawns the harness vite server (real XTerminal.tsx + mock WS).
export default defineConfig({
  testDir: "./test/e2e",
  timeout: 30000,
  reporter: [["list"]],
  use: {
    ...devices["Pixel 7"],
  },
  webServer: {
    command: "bunx vite --config vite.test.config.ts",
    url: "http://localhost:5199/",
    reuseExistingServer: false,
    timeout: 60000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
