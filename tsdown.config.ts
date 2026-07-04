import { resolve } from "node:path";

import { defineConfig } from "tsdown";

export default defineConfig({
  deps: {
    neverBundle: ["@starfetch-js/skill"],
  },
  entry: [resolve(process.cwd(), "src/index.ts")],
  fixedExtension: false,
  format: "esm",
  outDir: resolve(process.cwd(), "dist"),
  dts: true,
});
