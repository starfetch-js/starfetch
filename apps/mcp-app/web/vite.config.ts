import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), viteSingleFile()],
  build: {
    cssCodeSplit: false,
    emptyOutDir: true,
    minify: "terser",
    outDir: "dist",
    target: "es2022",
    terserOptions: { format: { ascii_only: true } },
  },
});
