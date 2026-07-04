import { runQueryExample } from "../_shared/run-example.mjs";

await runQueryExample(import.meta.url, {
  service: "gaia",
  format: "csv",
  outputFile: "hr-diagram-table.csv",
});
