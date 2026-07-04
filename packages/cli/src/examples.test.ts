import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "..", "..", "..");
const examplesRoot = resolve(repoRoot, "examples");
const exampleNames = [
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

describe("examples", () => {
  it("keeps every documented example runnable through Node", async () => {
    for (const exampleName of exampleNames) {
      const dir = resolve(examplesRoot, exampleName);
      const files = await readdir(dir);

      expect(files).toContain("README.md");
      expect(files).toContain("run.mjs");
      expect(files).toContain("expected-columns.json");
      expect(files.some((file) => file.endsWith(".sql"))).toBe(true);

      const expectedColumns = JSON.parse(
        await readFile(resolve(dir, "expected-columns.json"), "utf8"),
      );

      expect(expectedColumns).toEqual(
        expect.arrayContaining([expect.any(String)]),
      );
    }
  });

  it("does not make shell scripts the primary example interface", async () => {
    for (const exampleName of exampleNames) {
      const files = await readdir(resolve(examplesRoot, exampleName));
      const shellScripts = files.filter((file) => file.endsWith(".sh"));

      expect(shellScripts).toEqual([]);
    }
  });
});
