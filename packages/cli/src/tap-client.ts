import {
  parseTapJobReference,
  tap,
  type TapClient,
  type TapTarget,
} from "@starfetch-js/core";
import type { Command } from "commander";

export type TapTargetCommand = {
  service?: string;
  url?: string;
};

export function createTapClient(
  command: TapTargetCommand,
  fetchImpl: typeof fetch | undefined,
): TapClient {
  return tap(createTapTarget(command), createOptions(fetchImpl));
}

export function createTapJobClient(
  jobIdOrUrl: string,
  command: TapTargetCommand,
  fetchImpl: typeof fetch | undefined,
): TapClient {
  const reference = parseTapJobReference(jobIdOrUrl);

  if (reference.kind === "absolute-url") {
    return tap({ url: reference.baseUrl }, createOptions(fetchImpl));
  }

  return createTapClient(command, fetchImpl);
}

export function addTapTargetOptions(command: Command): Command {
  return command
    .option("--url <tap-url>", "TAP service URL")
    .option("--service <name>", "known TAP service preset");
}

function createTapTarget(command: TapTargetCommand): TapTarget {
  if (command.url !== undefined) {
    if (command.service !== undefined) {
      return { service: command.service, url: command.url };
    }

    return { url: command.url };
  }

  if (command.service !== undefined) {
    return { service: command.service };
  }

  throw new Error("Specify --url or --service.");
}

function createOptions(fetchImpl: typeof fetch | undefined): {
  fetch?: typeof fetch;
} {
  return fetchImpl === undefined ? {} : { fetch: fetchImpl };
}
