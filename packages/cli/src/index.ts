#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Command, CommanderError } from "commander";

import { writeOutput } from "./cli-output.js";
import type { RunCliOptions } from "./cli-runtime.js";
import { registerSkillCommand } from "./skill-command.js";
import { registerTapJobsCommand } from "./tap-jobs-command.js";
import { registerTapMetadataCommands } from "./tap-metadata-command.js";
import { registerTapQueryCommand } from "./tap-query-command.js";
import { registerTapRegistryCommand } from "./tap-registry-command.js";

export function helpText(): string {
  return createProgram({
    stdout: process.stdout,
    stderr: process.stderr,
  }).helpInformation();
}

export async function runCli(
  argv = process.argv.slice(2),
  options: RunCliOptions = {},
): Promise<number> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const programOptions: RunCliOptions = { stdout, stderr };

  if (options.stdin !== undefined) {
    programOptions.stdin = options.stdin;
  }

  if (options.fetch !== undefined) {
    programOptions.fetch = options.fetch;
  }

  if (options.cwd !== undefined) {
    programOptions.cwd = options.cwd;
  }

  if (options.homeDir !== undefined) {
    programOptions.homeDir = options.homeDir;
  }

  const program = createProgram(programOptions);

  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }

    writeOutput(stderr, `${formatError(error)}\n`);
    return 1;
  }
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  process.exitCode = await runCli(process.argv.slice(2), {
    stdin: process.stdin,
  });
}

export function isCliEntrypoint(
  moduleUrl: string,
  argvPath: string | undefined,
): boolean {
  if (argvPath === undefined) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}

function createProgram(options: RunCliOptions): Command {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const program = new Command();

  program
    .name("starfetch")
    .description("Query astronomical TAP services.")
    .exitOverride()
    .showHelpAfterError()
    .configureOutput({
      writeOut: (chunk) => writeOutput(stdout, chunk),
      writeErr: (chunk) => writeOutput(stderr, chunk),
      outputError: (chunk, write) => write(chunk),
    });

  registerSkillCommand(program, options);

  const tapCommand = program
    .command("tap")
    .description("Work with TAP services.");

  registerTapMetadataCommands(tapCommand, options);
  registerTapQueryCommand(tapCommand, options);
  registerTapJobsCommand(tapCommand, options);
  registerTapRegistryCommand(tapCommand, options);

  return program;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown CLI error";
}
