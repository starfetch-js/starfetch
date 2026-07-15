import { relative } from "node:path";

import { defineConfig } from "vitest/config";

const workspaceRoot = import.meta.dirname;
const cwdFromRoot = relative(workspaceRoot, process.cwd());
const packageMatch = /^(?:apps|packages)\/[^/]+$/.exec(cwdFromRoot);
const testInclude = packageMatch
  ? [`${cwdFromRoot}/src/**/*.test.ts`, `${cwdFromRoot}/test/**/*.test.ts`]
  : [
      "apps/*/src/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "packages/*/test/**/*.test.ts",
    ];

export default defineConfig({
  root: workspaceRoot,
  resolve: {
    alias: {
      "@starfetch-js/core": new URL(
        "./packages/core/src/index.ts",
        import.meta.url,
      ).pathname,
      "@starfetch-js/mcp": new URL(
        "./packages/mcp/src/index.ts",
        import.meta.url,
      ).pathname,
      "@starfetch-js/skill": new URL(
        "./packages/skill/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: testInclude,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["apps/*/src/**/*.ts", "packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.types.ts", "**/test/**"],
    },
  },
});
