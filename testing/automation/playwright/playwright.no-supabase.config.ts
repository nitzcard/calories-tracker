import { defineConfig } from "@playwright/test";

declare const process: {
  env: Record<string, string | undefined> & {
    APP_URL?: string;
    CI?: string;
  };
};

const isCI = Boolean(process.env.CI);
const noSupabaseBaseURL = process.env.APP_URL || "http://127.0.0.1:7002";

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
        ["html", { open: "never", outputFolder: "playwright-report-no-supabase" }],
        ["junit", { outputFile: "test-results/playwright/no-supabase-junit.xml" }],
      ]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report-no-supabase" }]],
  use: {
    baseURL: noSupabaseBaseURL,
    headless: true,
    trace: "retain-on-failure",
    video: "on",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "VITE_SUPABASE_URL='' VITE_SUPABASE_ANON_KEY='' npm run dev -- --port 7002",
    url: noSupabaseBaseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
