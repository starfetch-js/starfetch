import { runQueryExample } from "../_shared/run-example.mjs";

await runQueryExample(import.meta.url, {
  service: "vizier",
  format: "jsonl",
  outputFile: "vizier-filtered.jsonl",
});
