import { runQueryExample } from "../_shared/run-example.mjs";

await runQueryExample(import.meta.url, {
  service: "simbad",
  format: "jsonl",
  outputFile: "objects.jsonl",
});
