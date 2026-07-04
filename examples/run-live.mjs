import { resolve } from "node:path";

import { repoRoot, runNodeScript } from "./_shared/run-example.mjs";

const examples = [
  "01-gaia-nearby-stars",
  "02-gaia-high-proper-motion",
  "03-gaia-hr-diagram-table",
  "04-simbad-field-object-types",
  "05-simbad-identifiers-join",
  "06-vizier-catalog-field-query",
  "07-vizier-filtered-catalog-query",
  "08-exoplanet-target-shortlist",
  "09-exoplanet-transiting-hosts",
  "10-irsa-wise-region-query",
  "11-irsa-spatial-query-cookbook",
  "12-gaia-async-large-query",
];

for (const example of examples) {
  console.log(`\n== ${example} ==`);
  await runNodeScript(resolve(repoRoot, "examples", example, "run.mjs"));
}
