import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import type {
  QueryOptions,
  TapSyncFormat,
  TapUpload,
} from "@starfetch-js/core";
import { InvalidArgumentError, type Command } from "commander";

export type TapRequestParamCommand = {
  maxrec?: number;
  runId?: string;
  upload?: string[];
  uploadUrl?: string[];
};

export function addTapRequestParamOptions(command: Command): Command {
  return command
    .option("--maxrec <rows>", "TAP MAXREC row limit", parseMaxrec)
    .option("--run-id <id>", "TAP RUNID request identifier")
    .option(
      "--upload <table=path>",
      "upload a local VOTable file as a TAP temporary table",
      parseUploadFileDescriptorFlag,
      [],
    )
    .option(
      "--upload-url <table=uri>",
      "upload an external VOTable URI as a TAP temporary table",
      parseUploadUriDescriptorFlag,
      [],
    );
}

export async function createTapRequestQueryOptions(
  command: TapRequestParamCommand,
  format?: TapSyncFormat,
): Promise<QueryOptions> {
  const queryOptions: QueryOptions = {};

  if (format !== undefined) {
    queryOptions.format = format;
  }

  if (command.maxrec !== undefined) {
    queryOptions.maxrec = command.maxrec;
  }

  if (command.runId !== undefined) {
    queryOptions.runId = command.runId;
  }

  const uploads = await createTapUploads(command);

  if (uploads.length > 0) {
    queryOptions.uploads = uploads;
  }

  return queryOptions;
}

export function parseMaxrec(value: string): number {
  const maxrec = Number(value);

  if (!Number.isSafeInteger(maxrec) || maxrec < 0) {
    throw new InvalidArgumentError(
      "--maxrec must be a non-negative safe integer.",
    );
  }

  return maxrec;
}

function parseUploadFileDescriptorFlag(
  value: string,
  previous: string[] = [],
): string[] {
  parseUploadDescriptor(value, "upload");

  return [...previous, value];
}

function parseUploadUriDescriptorFlag(
  value: string,
  previous: string[] = [],
): string[] {
  parseUploadDescriptor(value, "upload-url");

  return [...previous, value];
}

async function createTapUploads(
  command: TapRequestParamCommand,
): Promise<TapUpload[]> {
  const uploads: TapUpload[] = [];

  for (const descriptor of command.upload ?? []) {
    const { tableName, source } = parseUploadDescriptor(descriptor, "upload");

    uploads.push({
      tableName,
      votable: await readUploadFile(source),
      filename: basename(source),
    });
  }

  for (const descriptor of command.uploadUrl ?? []) {
    const { tableName, source } = parseUploadDescriptor(
      descriptor,
      "upload-url",
    );

    uploads.push({
      tableName,
      uri: source,
    });
  }

  return uploads;
}

function parseUploadDescriptor(
  value: string,
  flagName: "upload" | "upload-url",
): { tableName: string; source: string } {
  const separator = value.indexOf("=");

  if (separator <= 0 || separator === value.length - 1) {
    throw new InvalidArgumentError(
      `--${flagName} must use table=${flagName === "upload" ? "path" : "uri"}.`,
    );
  }

  return {
    tableName: value.slice(0, separator),
    source: value.slice(separator + 1),
  };
}

async function readUploadFile(path: string): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Unable to read TAP upload file ${path}: ${message}`);
  }
}
