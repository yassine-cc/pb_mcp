import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts", "**/*.spec.ts"],
    exclude: ["node_modules", "dist", "build"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "build/", "**/*.test.ts", "**/*.spec.ts", "**/test-utils/**"],
    },
    // Property-based testing configuration
    testTimeout: 30000, // 30 seconds for property tests with 100+ iterations
  },
});
