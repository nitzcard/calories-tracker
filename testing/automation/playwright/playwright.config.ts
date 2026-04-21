import { defineConfig } from "@playwright/test";

const baseURL = process.env.APP_URL || "http://127.0.0.1:7001";
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  reporter: isCI
    ? [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
        ["junit", { outputFile: "test-results/playwright/junit.xml" }],
      ]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    video: "on",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
