import { defineConfig } from "vitest/config";

/**
 * Shared vitest configuration template for uploadista-sdk packages
 *
 * This template should be used by all SDK packages to ensure consistent
 * testing configuration across the monorepo.
 *
 * Key features:
 * - Tests in dedicated `tests/` directories (not colocated with src)
 * - Node environment for server-side code
 * - V8 coverage provider
 * - Global test functions available
 * - Effect testing support via @effect/vitest
 *
 * Usage:
 * Copy this file to your package root as `vitest.config.ts` and customize
 * if needed (though most packages should use this as-is).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.d.ts",
        "**/*.test.ts",
        "**/*.spec.ts",
        "tests/",
      ],
    },
  },
});
