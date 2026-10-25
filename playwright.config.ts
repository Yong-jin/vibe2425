import { defineConfig, devices } from "@playwright/test";

const suppliedBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const useExistingServer = !!suppliedBaseURL || process.env.PLAYWRIGHT_USE_EXISTING_SERVER === "1";
const baseURL = suppliedBaseURL ?? (useExistingServer ? "http://127.0.0.1:3000" : "http://127.0.0.1:3100");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  expect: { timeout: 10000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: useExistingServer ? undefined : {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: { DATA_MODE: "demo" },
  },
});
