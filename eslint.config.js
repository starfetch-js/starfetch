import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "coverage/**",
      "dist/**",
      ".tmp/**",
      "node_modules/**",
      "apps/*/dist/**",
      "packages/*/dist/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "examples/**/*.mjs",
      "packages/*/test/**/*.mjs",
      "scripts/**/*.mjs",
    ],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.base.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
