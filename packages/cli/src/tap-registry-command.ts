import {
  registry,
  type TapRegistryOptions,
  type TapRegistryService,
  type TapRegistrySearchOptions,
} from "@starfetch-js/core";
import type { Command } from "commander";

import { writeOutput } from "./cli-output.js";
import type { RunCliOptions } from "./cli-runtime.js";
import {
  parseTapMetadataFormat,
  type TapMetadataFormat,
} from "./tap-format.js";
import { parseMaxrec } from "./tap-request-params.js";

type TapRegistryCommand = {
  registryUrl?: string;
  maxrec?: number;
  format: TapMetadataFormat;
};

export function registerTapRegistryCommand(
  tapCommand: Command,
  options: RunCliOptions,
): void {
  const registryCommand = tapCommand
    .command("registry")
    .description("Discover TAP services through VO registry metadata.");

  registryCommand
    .command("search")
    .description("Search a VO registry for TAP services.")
    .argument("[query]", "registry search text")
    .option("--registry-url <tap-url>", "RegTAP registry service URL")
    .option("--maxrec <rows>", "TAP MAXREC row limit", parseMaxrec)
    .option(
      "--format <format>",
      "output format",
      parseTapMetadataFormat,
      "text",
    )
    .action(async (query: string | undefined, command: TapRegistryCommand) => {
      await runTapRegistrySearch(query, command, options);
    });
}

async function runTapRegistrySearch(
  query: string | undefined,
  command: TapRegistryCommand,
  options: RunCliOptions,
): Promise<void> {
  const registryOptions = createRegistryOptions(command, options);
  const client = registry(registryOptions);
  const searchOptions: TapRegistrySearchOptions = {};

  if (query !== undefined) {
    searchOptions.query = query;
  }

  if (command.maxrec !== undefined) {
    searchOptions.maxrec = command.maxrec;
  }

  const services = await client.searchTapServices(searchOptions);
  writeRegistrySearch(options, command.format, services);
}

function createRegistryOptions(
  command: TapRegistryCommand,
  options: RunCliOptions,
): TapRegistryOptions {
  const registryOptions: TapRegistryOptions = {};

  if (options.fetch !== undefined) {
    registryOptions.fetch = options.fetch;
  }

  if (command.registryUrl !== undefined) {
    registryOptions.registryUrl = command.registryUrl;
  }

  return registryOptions;
}

function writeRegistrySearch(
  options: RunCliOptions,
  format: TapMetadataFormat,
  services: TapRegistryService[],
): void {
  const stdout = options.stdout ?? process.stdout;
  const output =
    format === "json"
      ? `${JSON.stringify(services, null, 2)}\n`
      : formatRegistryServicesText(services);

  writeOutput(stdout, output);
}

function formatRegistryServicesText(services: TapRegistryService[]): string {
  return services
    .map((service) =>
      [
        service.title,
        service.accessUrl,
        service.ivoid,
        service.description ?? "",
      ].join("\t"),
    )
    .join("\n")
    .concat(services.length > 0 ? "\n" : "");
}
