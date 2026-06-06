import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Minimal config for the mobile-scroll repro harness. base:/ + root at the
// harness dir so Playwright can hit http://localhost:5199/ directly with no
// /maw/ prefix juggling. Imports the REAL src/components/XTerminal.tsx.
export default defineConfig({
  plugins: [react()],
  root: "test/harness",
  base: "/",
  define: {
    __MAW_VERSION__: JSON.stringify("test"),
    __MAW_BUILD__: JSON.stringify("test"),
    __APP_VERSION__: JSON.stringify("test"),
  },
  server: { host: true, port: 5199, strictPort: true },
});
