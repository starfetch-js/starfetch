import {
  tapOutputFormats,
  tapSyncFormats,
  type TapOutputFormat,
  type TapSyncFormat,
} from "@starfetch-js/core";
import { InvalidArgumentError } from "commander";

const supportedMetadataFormats = ["text", "json"] as const;

export type TapMetadataFormat = (typeof supportedMetadataFormats)[number];

export function parseTapResultFormat(value: string): TapOutputFormat {
  if (isSupportedCliFormat(value)) {
    return value;
  }

  throw new InvalidArgumentError(
    `Unsupported format: ${value}. Supported formats: votable, csv, tsv, json, jsonl.`,
  );
}

export function parseTapSourceFormat(value: string): TapSyncFormat {
  if (isSupportedTapSourceFormat(value)) {
    return value;
  }

  throw new InvalidArgumentError(
    `Unsupported source format: ${value}. Supported source formats: votable, csv, tsv.`,
  );
}

function isSupportedCliFormat(value: string): value is TapOutputFormat {
  return tapOutputFormats.includes(value as TapOutputFormat);
}

function isSupportedTapSourceFormat(value: string): value is TapSyncFormat {
  return tapSyncFormats.includes(value as TapSyncFormat);
}

export function parseTapMetadataFormat(value: string): TapMetadataFormat {
  if (isSupportedMetadataFormat(value)) {
    return value;
  }

  throw new InvalidArgumentError(
    `Unsupported metadata format: ${value}. Supported formats: text, json.`,
  );
}

function isSupportedMetadataFormat(value: string): value is TapMetadataFormat {
  return supportedMetadataFormats.includes(value as TapMetadataFormat);
}
