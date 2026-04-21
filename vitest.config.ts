import { defineConfig } from "vitest/config";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    reporters: isCI ? ["default", "junit", "html"] : ["default"],
    outputFile: isCI
      ? {
          junit: "./test-results/vitest/junit.xml",
          html: "./test-results/vitest/index.html",
        }
      : undefined,
  },
});
