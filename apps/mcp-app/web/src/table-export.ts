import type { StarfetchTableViewV1 } from "../../src/presentation-contract.js";

export type DataFormat = "csv" | "json" | "tsv";

type TableColumn = StarfetchTableViewV1["columns"][number];
type TableRow = StarfetchTableViewV1["rows"][number];

export type TableExport = Readonly<{
  filename: string;
  mimeType: string;
  text: string;
}>;

const mimeTypes: Record<DataFormat, string> = {
  csv: "text/csv",
  json: "application/json",
  tsv: "text/tab-separated-values",
};

export function createTableExport(
  format: DataFormat,
  columns: readonly TableColumn[],
  rows: readonly TableRow[],
): TableExport {
  const keys = columns.map((column) => column.key);
  return {
    filename: `starfetch-results.${format}`,
    mimeType: mimeTypes[format],
    text: serializeRows(format, keys, rows),
  };
}

function serializeRows(
  format: DataFormat,
  keys: readonly string[],
  rows: readonly TableRow[],
): string {
  if (format === "json") {
    return JSON.stringify(
      rows.map((row) =>
        Object.fromEntries(keys.map((key) => [key, row[key] ?? null])),
      ),
      null,
      2,
    );
  }
  return toDelimitedText(keys, rows, format === "csv" ? "," : "\t");
}

function toDelimitedText(
  keys: readonly string[],
  rows: readonly TableRow[],
  delimiter: "," | "\t",
): string {
  return [
    keys.join(delimiter),
    ...rows.map((row) =>
      keys.map((key) => escapeDelimited(row[key], delimiter)).join(delimiter),
    ),
  ].join("\n");
}

function escapeDelimited(
  value: TableRow[string] | undefined,
  delimiter: "," | "\t",
): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (!text.includes(delimiter) && !/[\n\r"]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}
