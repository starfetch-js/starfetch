import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const sharedDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(sharedDir, "..", "..");
export const cliPath = resolve(repoRoot, "packages", "cli", "dist", "index.js");

export function exampleDir(metaUrl) {
  return dirname(fileURLToPath(metaUrl));
}

export function fromExample(dir, ...parts) {
  return resolve(dir, ...parts);
}

export async function ensureOutDir(dir) {
  const outDir = fromExample(dir, "out");
  await mkdir(outDir, { recursive: true });
  return outDir;
}

export async function runCli(args, options = {}) {
  const result = await runProcess(
    process.execPath,
    [cliPath, ...args],
    options,
  );

  if (result.stdout.trim() !== "") {
    process.stdout.write(result.stdout);
  }

  if (result.stderr.trim() !== "") {
    process.stderr.write(result.stderr);
  }

  return result;
}

export async function runCliCapture(args, options = {}) {
  return runProcess(process.execPath, [cliPath, ...args], options);
}

export async function runNodeScript(scriptPath, options = {}) {
  return runProcess(process.execPath, [scriptPath], {
    stdio: "inherit",
    ...options,
  });
}

export async function runQueryExample(metaUrl, config) {
  const dir = exampleDir(metaUrl);
  const outDir = await ensureOutDir(dir);
  const queryFile = config.queryFile ?? "query.sql";
  const outputPath = fromExample(outDir, config.outputFile);

  await runCli([
    "tap",
    "query",
    "--service",
    config.service,
    "--file",
    fromExample(dir, queryFile),
    "--format",
    config.format,
    "--out",
    outputPath,
  ]);

  await verifyExpectedColumns(dir, outputPath);
  console.log(outputPath);
}

export async function verifyExpectedColumns(exampleDirectory, outputPath) {
  const expected = JSON.parse(
    await readFile(
      fromExample(exampleDirectory, "expected-columns.json"),
      "utf8",
    ),
  );

  if (
    !Array.isArray(expected) ||
    expected.some((column) => typeof column !== "string")
  ) {
    throw new Error("expected-columns.json must be an array of strings");
  }

  const output = await readFile(outputPath, "utf8");
  const actual = readColumns(outputPath, output);
  const missing = expected.filter((column) => !actual.includes(column));

  if (missing.length > 0) {
    throw new Error(
      `${outputPath} is missing expected columns: ${missing.join(", ")}`,
    );
  }

  console.log(`Verified columns: ${expected.join(", ")}`);
}

function readColumns(outputPath, output) {
  if (outputPath.endsWith(".jsonl")) {
    const firstLine = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line !== "");

    if (firstLine === undefined) {
      throw new Error(`${outputPath} did not contain any JSONL rows`);
    }

    return Object.keys(JSON.parse(firstLine));
  }

  if (outputPath.endsWith(".json")) {
    const parsed = JSON.parse(output);
    const firstRow = Array.isArray(parsed) ? parsed[0] : parsed;

    if (firstRow === undefined || firstRow === null) {
      throw new Error(`${outputPath} did not contain any JSON rows`);
    }

    return Object.keys(firstRow);
  }

  if (outputPath.endsWith(".xml") || outputPath.endsWith(".votable")) {
    return [...output.matchAll(/\bname=(["'])(.*?)\1/g)].map(
      (match) => match[2],
    );
  }

  const firstLine = output.split(/\r?\n/, 1)[0];

  if (firstLine === undefined || firstLine.trim() === "") {
    throw new Error(`${outputPath} did not contain a header row`);
  }

  return firstLine.split(outputPath.endsWith(".tsv") ? "\t" : ",");
}

function runProcess(command, args, options) {
  return new Promise((resolveProcess, reject) => {
    const stdio = options.stdio ?? ["ignore", "pipe", "pipe"];
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio,
      ...options,
    });
    let stdout = "";
    let stderr = "";

    if (child.stdout !== null) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }

    if (child.stderr !== null) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolveProcess({ stdout, stderr });
        return;
      }

      reject(
        new Error(
          [
            `Command failed with exit code ${code}: ${command} ${args.join(" ")}`,
            stderr,
          ]
            .filter(Boolean)
            .join("\n"),
        ),
      );
    });
  });
}
