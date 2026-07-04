import { runQueryExample } from "../_shared/run-example.mjs";

await runQueryExample(import.meta.url, {
  service: "exoplanetarchive",
  format: "jsonl",
  outputFile: "transiting-hosts.jsonl",
});
