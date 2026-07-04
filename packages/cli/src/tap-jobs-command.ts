import {
  formatTapResult,
  tapRequestFormatForOutput,
  type TapJobStatus,
  type TapJobWaitOptions,
  type TapOutputFormat,
  type TapSyncFormat,
} from "@starfetch-js/core";
import { InvalidArgumentError, type Command } from "commander";

import { writeOutput, writeResultData } from "./cli-output.js";
import type { RunCliOptions } from "./cli-runtime.js";
import {
  addQueryInputOptions,
  readQueryInput,
  type QueryInputCommand,
} from "./query-input.js";
import {
  addTapTargetOptions,
  createTapClient,
  createTapJobClient,
  type TapTargetCommand,
} from "./tap-client.js";
import { parseTapResultFormat, parseTapSourceFormat } from "./tap-format.js";
import {
  addTapRequestParamOptions,
  createTapRequestQueryOptions,
  type TapRequestParamCommand,
} from "./tap-request-params.js";

type TapJobsSubmitCommand = TapTargetCommand &
  QueryInputCommand &
  TapRequestParamCommand;

type TapJobsCommand = TapTargetCommand;

type TapJobsFetchCommand = TapJobsCommand & {
  format: TapOutputFormat;
  out?: string;
  sourceFormat?: TapSyncFormat;
};

type TapJobsWaitCommand = TapJobsCommand & {
  interval?: number;
  timeout?: number;
  backoff?: boolean;
  maxInterval?: number;
};

export function registerTapJobsCommand(
  tapCommand: Command,
  options: RunCliOptions,
): void {
  const jobsCommand = tapCommand
    .command("jobs")
    .description("Work with TAP async jobs.");

  addTapRequestParamOptions(
    addQueryInputOptions(
      addTapTargetOptions(
        jobsCommand
          .command("submit")
          .description("Submit an asynchronous TAP query."),
      ),
    ),
  ).action(async (command: TapJobsSubmitCommand) => {
    await runTapJobsSubmit(command, options);
  });

  addTapTargetOptions(
    jobsCommand
      .command("status")
      .description("Read an asynchronous TAP job status.")
      .argument("<job-id-or-url>", "TAP async job id or URL"),
  ).action(async (jobIdOrUrl: string, command: TapJobsCommand) => {
    await runTapJobsStatus(jobIdOrUrl, command, options);
  });

  addTapTargetOptions(
    jobsCommand
      .command("wait")
      .description("Wait for an asynchronous TAP job to complete.")
      .argument("<job-id-or-url>", "TAP async job id or URL"),
  )
    .option("--interval <ms>", "poll interval in milliseconds", parseWaitMs)
    .option("--timeout <ms>", "wait timeout in milliseconds", parseWaitMs)
    .option("--backoff", "increase the poll interval between status reads")
    .option(
      "--max-interval <ms>",
      "maximum backoff interval in milliseconds",
      parseWaitMs,
    )
    .action(async (jobIdOrUrl: string, command: TapJobsWaitCommand) => {
      await runTapJobsWait(jobIdOrUrl, command, options);
    });

  addTapTargetOptions(
    jobsCommand
      .command("fetch")
      .description("Fetch an asynchronous TAP job result.")
      .argument("<job-id-or-url>", "TAP async job id or URL"),
  )
    .requiredOption("--format <format>", "output format", parseTapResultFormat)
    .option(
      "--source-format <format>",
      "actual TAP result format for async job output",
      parseTapSourceFormat,
    )
    .option("--out <path>", "write output to a file")
    .action(async (jobIdOrUrl: string, command: TapJobsFetchCommand) => {
      await runTapJobsFetch(jobIdOrUrl, command, options);
    });

  addTapTargetOptions(
    jobsCommand
      .command("delete")
      .description("Delete an asynchronous TAP job.")
      .argument("<job-id-or-url>", "TAP async job id or URL"),
  ).action(async (jobIdOrUrl: string, command: TapJobsCommand) => {
    await runTapJobsDelete(jobIdOrUrl, command, options);
  });
}

async function runTapJobsSubmit(
  command: TapJobsSubmitCommand,
  options: RunCliOptions,
): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  const query = await readQueryInput(command, options);
  const client = createTapClient(command, options.fetch);
  const job = await client.jobs.submit(
    query,
    await createTapRequestQueryOptions(command),
  );

  writeOutput(stdout, `${job.url}\n`);
}

async function runTapJobsStatus(
  jobIdOrUrl: string,
  command: TapJobsCommand,
  options: RunCliOptions,
): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  const client = createTapJobClient(jobIdOrUrl, command, options.fetch);
  const status = await client.jobs.from(jobIdOrUrl).status();

  writeOutput(stdout, formatJobStatus(status));
}

async function runTapJobsWait(
  jobIdOrUrl: string,
  command: TapJobsWaitCommand,
  options: RunCliOptions,
): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const client = createTapJobClient(jobIdOrUrl, command, options.fetch);
  const status = await client.jobs.from(jobIdOrUrl).wait(
    createTapJobWaitOptions(command, (jobStatus) => {
      writeOutput(stderr, `phase: ${jobStatus.phase}\n`);
    }),
  );

  writeOutput(stdout, formatJobStatus(status));
}

async function runTapJobsFetch(
  jobIdOrUrl: string,
  command: TapJobsFetchCommand,
  options: RunCliOptions,
): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  const client = createTapJobClient(jobIdOrUrl, command, options.fetch);
  const result = await client.jobs.from(jobIdOrUrl).fetch({
    format: command.sourceFormat ?? tapRequestFormatForOutput(command.format),
  });
  const data = await formatTapResult(result, command.format);

  await writeResultData(data, command.out, stdout);
}

async function runTapJobsDelete(
  jobIdOrUrl: string,
  command: TapJobsCommand,
  options: RunCliOptions,
): Promise<void> {
  const client = createTapJobClient(jobIdOrUrl, command, options.fetch);

  await client.jobs.from(jobIdOrUrl).delete();
}

function formatJobStatus(status: TapJobStatus): string {
  const lines = [`phase: ${status.phase}`];

  if (status.resultUrl !== undefined) {
    lines.push(`result: ${status.resultUrl}`);
  }

  if (status.errorUrl !== undefined) {
    lines.push(`error: ${status.errorUrl}`);
  }

  if (status.message !== undefined) {
    lines.push(`message: ${status.message}`);
  }

  return `${lines.join("\n")}\n`;
}

function createTapJobWaitOptions(
  command: TapJobsWaitCommand,
  onProgress: (status: TapJobStatus) => void,
): TapJobWaitOptions {
  const options: TapJobWaitOptions = { onProgress };

  if (command.interval !== undefined) {
    options.intervalMs = command.interval;
  }

  if (command.timeout !== undefined) {
    options.timeoutMs = command.timeout;
  }

  if (command.backoff === true) {
    options.backoff = true;
  }

  if (command.maxInterval !== undefined) {
    options.maxIntervalMs = command.maxInterval;
  }

  return options;
}

function parseWaitMs(value: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError(
      "Wait values must be non-negative safe integers.",
    );
  }

  return parsed;
}
