import { defineConfig } from "@playwright/test";

declare const process: {
  env: Record<string, string | undefined> & {
    APP_URL?: string;
    CI?: string;
    VITE_SUPABASE_URL?: string;
    VITE_SUPABASE_ANON_KEY?: string;
  };
};

const baseURL = process.env.APP_URL || "http://127.0.0.1:7001";
const isCI = Boolean(process.env.CI);
const fakeSupabaseUrl = process.env.VITE_SUPABASE_URL || "https://playwright-supabase.test";
const fakeSupabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "playwright-anon-key";

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
    command: `VITE_SUPABASE_URL='${fakeSupabaseUrl}' VITE_SUPABASE_ANON_KEY='${fakeSupabaseAnonKey}' npm run dev`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
