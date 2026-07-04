import { parse } from "csv-parse/sync";

import { TapParseError } from "./errors.js";
import type { TapSyncFormat } from "./tap-format.js";
import type { TapRow } from "./tap-row.js";

export function parseDelimitedRows(
  format: TapSyncFormat,
  text: string,
): TapRow[] {
  const delimiter = delimiterForFormat(format);

  if (delimiter === undefined) {
    throw new TapParseError(`Cannot parse ${format} as delimited rows.`);
  }

  try {
    const rows = parse(text, {
      bom: true,
      columns: true,
      delimiter,
      skip_empty_lines: true,
    }) as Record<string, string>[];

    return rows.map(normalizeRow);
  } catch (error) {
    throw new TapParseError(
      `Could not parse ${format.toUpperCase()} TAP result: ${errorMessage(error)}`,
    );
  }
}

function delimiterForFormat(format: TapSyncFormat): "," | "\t" | undefined {
  switch (format) {
    case "csv":
      return ",";
    case "tsv":
      return "\t";
    case "votable":
      return undefined;
  }
}

function normalizeRow(row: Record<string, string>): TapRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value === "" ? null : value,
    ]),
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
