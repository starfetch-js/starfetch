import { runQueryExample } from "../_shared/run-example.mjs";

await runQueryExample(import.meta.url, {
  service: "gaia",
  format: "jsonl",
  outputFile: "high-proper-motion.jsonl",
});
