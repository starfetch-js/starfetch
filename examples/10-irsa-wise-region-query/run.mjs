import { runQueryExample } from "../_shared/run-example.mjs";

await runQueryExample(import.meta.url, {
  service: "irsa",
  format: "csv",
  outputFile: "sources.csv",
});
