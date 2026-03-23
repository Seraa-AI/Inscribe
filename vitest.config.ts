import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Use happy-dom for DOM APIs (canvas, measureText, etc.)
    environment: "happy-dom",

    // Pick up tests from all packages
    include: ["packages/*/src/**/*.test.ts", "packages/*/src/**/*.spec.ts"],

    // Global setup — runs once per test file before any tests execute
    setupFiles: ["./packages/core/vitest.setup.ts"],

    // Global test utilities available without importing
    globals: true,

    coverage: {
      provider: "v8",
      include: ["packages/core/src/**"],
      exclude: ["**/index.ts", "**/*.test.ts", "**/*.spec.ts"],
      reporter: ["text", "html"],
    },
  },
});
