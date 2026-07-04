import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

import type { Command } from "commander";

import type { RunCliOptions } from "./cli-runtime.js";

const missingQueryInputMessage = "Provide ADQL with --query, --file, or stdin.";

export type QueryInputCommand = {
  query?: string;
  file?: string;
};

export function addQueryInputOptions(command: Command): Command {
  return command
    .option("--query <adql>", "ADQL query")
    .option("--file <path>", "read ADQL query from a file");
}

export async function readQueryInput(
  command: QueryInputCommand,
  options: RunCliOptions,
): Promise<string> {
  if (command.query !== undefined) {
    return requireQueryText(command.query);
  }

  if (command.file !== undefined) {
    return requireQueryText(await readFile(command.file, "utf8"));
  }

  if (options.stdin !== undefined && options.stdin.isTTY !== true) {
    return requireQueryText(await readStdin(options.stdin));
  }

  throw new Error(missingQueryInputMessage);
}

function requireQueryText(query: string): string {
  if (query.length === 0) {
    throw new Error(missingQueryInputMessage);
  }

  return query;
}

async function readStdin(
  stdin: AsyncIterable<string | Uint8Array>,
): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of stdin) {
    chunks.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
    );
  }

  return chunks.join("");
}
