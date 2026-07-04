import {
  ensureOutDir,
  exampleDir,
  fromExample,
  runCli,
  verifyExpectedColumns,
} from "../_shared/run-example.mjs";

const dir = exampleDir(import.meta.url);
const outDir = await ensureOutDir(dir);
const queries = [
  ["cone.sql", "cone.csv"],
  ["box.sql", "box.csv"],
  ["polygon.sql", "polygon.csv"],
];

for (const [queryFile, outputFile] of queries) {
  const outputPath = fromExample(outDir, outputFile);

  await runCli([
    "tap",
    "query",
    "--service",
    "irsa",
    "--file",
    fromExample(dir, queryFile),
    "--format",
    "csv",
    "--out",
    outputPath,
  ]);

  await verifyExpectedColumns(dir, outputPath);
  console.log(outputPath);
}
