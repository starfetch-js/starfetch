import { resolve } from "node:path";

import { defineConfig } from "tsdown";

export default defineConfig({
  deps: {
    neverBundle: ["@starfetch-js/mcp"],
  },
  entry: [resolve(import.meta.dirname, "src/index.ts")],
  fixedExtension: false,
  format: "esm",
  outDir: resolve(import.meta.dirname, "dist"),
  dts: true,
});
