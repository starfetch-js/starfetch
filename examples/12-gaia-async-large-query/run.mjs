import {
  ensureOutDir,
  exampleDir,
  fromExample,
  runCli,
  runCliCapture,
  verifyExpectedColumns,
} from "../_shared/run-example.mjs";

const dir = exampleDir(import.meta.url);
const outDir = await ensureOutDir(dir);
const outputPath = fromExample(outDir, "result.xml");
let jobUrl;

try {
  const submit = await runCliCapture([
    "tap",
    "jobs",
    "submit",
    "--service",
    "gaia",
    "--file",
    fromExample(dir, "query.sql"),
  ]);
  jobUrl = submit.stdout.trim();
  console.log(jobUrl);

  await runCli(["tap", "jobs", "status", "--service", "gaia", jobUrl]);
  await runCli([
    "tap",
    "jobs",
    "wait",
    "--service",
    "gaia",
    "--interval",
    "2000",
    "--timeout",
    "120000",
    jobUrl,
  ]);
  await runCli([
    "tap",
    "jobs",
    "fetch",
    "--service",
    "gaia",
    jobUrl,
    "--format",
    "votable",
    "--out",
    outputPath,
  ]);

  await verifyExpectedColumns(dir, outputPath);
  console.log(outputPath);
} finally {
  if (jobUrl !== undefined && jobUrl !== "") {
    await runCli(["tap", "jobs", "delete", "--service", "gaia", jobUrl]);
  }
}
