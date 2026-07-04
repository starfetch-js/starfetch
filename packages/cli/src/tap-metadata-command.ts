import type {
  TapAvailability,
  TapCapabilities,
  TapColumn,
  TapTable,
} from "@starfetch-js/core";
import type { Command } from "commander";

import { writeOutput } from "./cli-output.js";
import type { RunCliOptions } from "./cli-runtime.js";
import {
  addTapTargetOptions,
  createTapClient,
  type TapTargetCommand,
} from "./tap-client.js";
import {
  parseTapMetadataFormat,
  type TapMetadataFormat,
} from "./tap-format.js";

type TapMetadataCommand = TapTargetCommand & {
  format: TapMetadataFormat;
};

type TapColumnsCommand = TapMetadataCommand & {
  table: string;
};

export function registerTapMetadataCommands(
  tapCommand: Command,
  options: RunCliOptions,
): void {
  metadataCommand(
    tapCommand,
    "capabilities",
    "Read TAP service capabilities.",
  ).action(async (command: TapMetadataCommand) => {
    await runTapCapabilities(command, options);
  });

  metadataCommand(
    tapCommand,
    "availability",
    "Read TAP service availability.",
  ).action(async (command: TapMetadataCommand) => {
    await runTapAvailability(command, options);
  });

  metadataCommand(tapCommand, "tables", "List TAP service tables.").action(
    async (command: TapMetadataCommand) => {
      await runTapTables(command, options);
    },
  );

  metadataCommand(tapCommand, "columns", "List TAP table columns.")
    .requiredOption("--table <name>", "TAP table name")
    .action(async (command: TapColumnsCommand) => {
      await runTapColumns(command, options);
    });
}

function metadataCommand(
  tapCommand: Command,
  name: string,
  description: string,
): Command {
  return addTapTargetOptions(
    tapCommand.command(name).description(description),
  ).option(
    "--format <format>",
    "output format",
    parseTapMetadataFormat,
    "text",
  );
}

async function runTapCapabilities(
  command: TapMetadataCommand,
  options: RunCliOptions,
): Promise<void> {
  const client = createTapClient(command, options.fetch);
  const capabilities = await client.capabilities();

  writeMetadata(options, command.format, capabilities, formatCapabilitiesText);
}

async function runTapAvailability(
  command: TapMetadataCommand,
  options: RunCliOptions,
): Promise<void> {
  const client = createTapClient(command, options.fetch);
  const availability = await client.availability();

  writeMetadata(options, command.format, availability, formatAvailabilityText);
}

async function runTapTables(
  command: TapMetadataCommand,
  options: RunCliOptions,
): Promise<void> {
  const client = createTapClient(command, options.fetch);
  const tables = await client.tables();

  writeMetadata(options, command.format, tables, formatTablesText);
}

async function runTapColumns(
  command: TapColumnsCommand,
  options: RunCliOptions,
): Promise<void> {
  const client = createTapClient(command, options.fetch);
  const columns = await client.columns(command.table);

  writeMetadata(options, command.format, columns, formatColumnsText);
}

function writeMetadata<T>(
  options: RunCliOptions,
  format: TapMetadataFormat,
  value: T,
  formatText: (value: T) => string,
): void {
  const stdout = options.stdout ?? process.stdout;
  const output =
    format === "json"
      ? `${JSON.stringify(value, null, 2)}\n`
      : formatText(value);

  writeOutput(stdout, output);
}

function formatCapabilitiesText(capabilities: TapCapabilities): string {
  return (
    [
      `auth: ${capabilities.auth}`,
      `languages: ${joinList(capabilities.languages)}`,
      `formats: ${joinList(capabilities.formats)}`,
    ].join("\n") + "\n"
  );
}

function formatAvailabilityText(availability: TapAvailability): string {
  const lines = [`available: ${availability.available ? "true" : "false"}`];

  if (availability.message !== undefined) {
    lines.push(`message: ${availability.message}`);
  }

  return `${lines.join("\n")}\n`;
}

function formatTablesText(tables: TapTable[]): string {
  return tables
    .map((table) =>
      [table.name, table.schema ?? "", table.description ?? ""].join("\t"),
    )
    .join("\n")
    .concat(tables.length > 0 ? "\n" : "");
}

function formatColumnsText(columns: TapColumn[]): string {
  return columns
    .map((column) =>
      [
        column.name,
        column.datatype ?? "",
        column.unit ?? "",
        column.ucd ?? "",
        column.description ?? "",
      ].join("\t"),
    )
    .join("\n")
    .concat(columns.length > 0 ? "\n" : "");
}

function joinList(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}
