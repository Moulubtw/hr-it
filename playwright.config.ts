import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE = "/hr-it";

/**
 * E2E runs against the real static export (what GitHub Pages serves),
 * built in demo mode (canned answers, no Gemini key) under the Pages base path.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}${BASE}/`,
    locale: "ru-RU",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `next build && node e2e/serve.mjs .next-e2e ${BASE} ${PORT}`,
    url: `http://localhost:${PORT}${BASE}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_BASE_PATH: BASE,
      NEXT_PUBLIC_HRIT_FAKE_AI: "1",
    },
  },
});
