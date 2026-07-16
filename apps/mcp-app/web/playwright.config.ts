import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npm --workspace @starfetch-js/mcp-app run browser:serve -- --strictPort",
    cwd: "../../..",
    reuseExistingServer: process.env.CI !== "true",
    url: "http://127.0.0.1:5174/test-host.html",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
