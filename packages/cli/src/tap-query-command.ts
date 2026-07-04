import {
  formatTapResult,
  tapRequestFormatForOutput,
  type TapOutputFormat,
} from "@starfetch-js/core";
import type { Command } from "commander";

import { writeResultData } from "./cli-output.js";
import type { RunCliOptions } from "./cli-runtime.js";
import {
  addQueryInputOptions,
  readQueryInput,
  type QueryInputCommand,
} from "./query-input.js";
import {
  addTapTargetOptions,
  createTapClient,
  type TapTargetCommand,
} from "./tap-client.js";
import { parseTapResultFormat } from "./tap-format.js";
import {
  addTapRequestParamOptions,
  createTapRequestQueryOptions,
  type TapRequestParamCommand,
} from "./tap-request-params.js";

type TapQueryCommand = TapTargetCommand & {
  format: TapOutputFormat;
  out?: string;
} & QueryInputCommand &
  TapRequestParamCommand;

export function registerTapQueryCommand(
  tapCommand: Command,
  options: RunCliOptions,
): void {
  addTapRequestParamOptions(
    addQueryInputOptions(
      addTapTargetOptions(
        tapCommand.command("query").description("Run a synchronous TAP query."),
      ),
    ).requiredOption(
      "--format <format>",
      "output format",
      parseTapResultFormat,
    ),
  )
    .option("--out <path>", "write output to a file")
    .action(async (command: TapQueryCommand) => {
      await runTapQuery(command, options);
    });
}

async function runTapQuery(
  command: TapQueryCommand,
  options: RunCliOptions,
): Promise<void> {
  const stdout = options.stdout ?? process.stdout;
  const query = await readQueryInput(command, options);
  const client = createTapClient(command, options.fetch);
  const result = await client.query(
    query,
    await createTapRequestQueryOptions(
      command,
      tapRequestFormatForOutput(command.format),
    ),
  );
  const data = await formatTapResult(result, command.format);

  await writeResultData(data, command.out, stdout);
}
