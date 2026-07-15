import { writeFile } from "node:fs/promises";

import {
  TapFormatUnsupportedError,
  TapParseError,
  TapServiceError,
} from "./errors.js";
import {
  parseDelimitedTable,
  type ParsedDelimitedTable,
} from "./delimited-rows.js";
import {
  parseVotable,
  parseVotableStatus,
  type VotableCellValue,
  type VotableDocument,
  type VotableField,
  type VotableInfo,
} from "./votable.js";
import type { TapOutputFormat, TapSyncFormat } from "./tap-format.js";
import type { TapRow } from "./tap-row.js";

/** Result wrapper returned by sync TAP queries and async job fetches. */
export type TapResult = {
  /** TAP request format used for the returned response. */
  format: TapSyncFormat;
  /** Response `content-type` header, when present. */
  contentType?: string;
  /** Read the result body as text. */
  text(): Promise<string>;
  /** Read supported rows as JSON-compatible row objects. */
  json(): Promise<TapRow[]>;
  /** Stream supported rows as row objects. */
  rows(): AsyncIterable<TapRow>;
  /** Read ordered result fields and available source metadata. */
  fields(): Promise<TapResultField[]>;
  /** Report TAP `QUERY_STATUS=OVERFLOW` when the result format exposes it. */
  overflow(): Promise<boolean | undefined>;
  /** Read the result body as raw bytes. */
  arrayBuffer(): Promise<ArrayBuffer>;
  /** Return a clone of the underlying web `Response`. */
  response(): Response;
  /** Save the result body to a filesystem path in Node-compatible runtimes. */
  save(path: string): Promise<void>;
};

/** Ordered field metadata exposed by a TAP query result. */
export type TapResultField = {
  name: string;
  datatype?: string;
  unit?: string;
  ucd?: string;
  utype?: string;
  description?: string;
};

/** Create a TAP result wrapper and reject TAP-reported service errors. */
export async function createTapResultFromResponse(
  format: TapSyncFormat,
  response: Response,
): Promise<TapResult> {
  const result = new ResponseTapResult(
    inferNativeTextFormat(format, response),
    response,
  );
  await result.assertNoTapServiceError();

  return result;
}

/**
 * Format a TAP result for CLI or adapter output.
 *
 * VOTable results can be converted to JSON, JSONL, CSV, or TSV when rows are
 * parseable. Native CSV, TSV, and VOTable pass through when requested as-is.
 *
 * @throws TapFormatUnsupportedError when conversion is not supported.
 * @throws TapParseError when VOTable parsing fails.
 */
export async function formatTapResult(
  result: TapResult,
  format: TapOutputFormat,
): Promise<string> {
  if (format === "votable") {
    assertPassThroughSupported(result, format);
    return result.text();
  }

  if (format === result.format && !isVotableLike(result)) {
    return result.text();
  }

  switch (format) {
    case "json":
      return `${JSON.stringify(await result.json(), null, 2)}\n`;
    case "jsonl":
      return formatJsonl(await result.json());
    case "csv":
      return formatDelimited(await parseResultVotable(result, format), ",");
    case "tsv":
      return formatDelimited(await parseResultVotable(result, format), "\t");
  }
}

async function parseResultVotable(
  result: TapResult,
  format: TapOutputFormat,
): Promise<VotableDocument> {
  if (!isVotableLike(result)) {
    throw new TapFormatUnsupportedError(
      `Cannot convert ${result.format} TAP results to ${format}.`,
    );
  }

  return parseVotable(await result.text());
}

function assertPassThroughSupported(
  result: TapResult,
  format: TapOutputFormat,
): void {
  if (result.format !== format && !isVotableLike(result)) {
    throw new TapFormatUnsupportedError(
      `Cannot convert ${result.format} TAP results to ${format}.`,
    );
  }
}

function isVotableLike(result: TapResult): boolean {
  return isVotableFormat(result.format, result.contentType);
}

function inferNativeTextFormat(
  fallbackFormat: TapSyncFormat,
  response: Response,
): TapSyncFormat {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (
    contentType.includes("text/csv") ||
    contentType.includes("application/csv") ||
    contentType.includes("application/x-csv")
  ) {
    return "csv";
  }

  if (
    contentType.includes("tab-separated-values") ||
    contentType.includes("text/tsv")
  ) {
    return "tsv";
  }

  return fallbackFormat;
}

function formatJsonl(rows: TapRow[]): string {
  if (rows.length === 0) {
    return "";
  }

  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function formatDelimited(
  votable: VotableDocument,
  delimiter: "," | "\t",
): string {
  const headers = votable.fields.map(fieldKey);
  const lines = [
    headers
      .map((header) => escapeDelimitedValue(header, delimiter))
      .join(delimiter),
    ...votable.rows.map((row) =>
      headers
        .map((header) => escapeDelimitedValue(row[header] ?? null, delimiter))
        .join(delimiter),
    ),
  ];

  return `${lines.join("\n")}\n`;
}

function escapeDelimitedValue(
  value: VotableCellValue,
  delimiter: "," | "\t",
): string {
  if (value === null) {
    return "";
  }

  const mustQuote =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r");

  if (!mustQuote) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}

function fieldKey(field: VotableField): string {
  const key = field.name ?? field.id;

  if (key === undefined || key.length === 0) {
    throw new TapParseError("VOTable FIELD must include name or ID");
  }

  return key;
}

class ResponseTapResult implements TapResult {
  readonly format: TapSyncFormat;
  readonly contentType?: string;
  readonly #response: Response;
  #textPromise?: Promise<string>;
  #arrayBufferPromise?: Promise<ArrayBuffer>;
  #votablePromise?: Promise<VotableDocument>;
  #queryStatusPromise?: Promise<VotableInfo | undefined>;
  #delimitedPromise?: Promise<ParsedDelimitedTable>;

  constructor(format: TapSyncFormat, response: Response) {
    this.format = format;
    this.#response = response;

    const contentType = response.headers.get("content-type");
    if (contentType !== null) {
      this.contentType = contentType;
    }
  }

  text(): Promise<string> {
    this.#textPromise ??= this.#response.clone().text();
    return this.#textPromise;
  }

  async json(): Promise<TapRow[]> {
    return this.#parseRows("json");
  }

  rows(): AsyncIterable<TapRow> {
    this.#assertRowsSupported("rows");
    return this.#rows();
  }

  async fields(): Promise<TapResultField[]> {
    if (this.#isVotableLike()) {
      return (await this.#votable()).fields.map(toResultField);
    }

    return (await this.#delimited()).fields.map((name) => ({ name }));
  }

  async overflow(): Promise<boolean | undefined> {
    if (!this.#isVotableLike()) {
      return undefined;
    }

    const value = (await this.#queryStatus())?.value;
    return value === undefined ? undefined : value.toUpperCase() === "OVERFLOW";
  }

  arrayBuffer(): Promise<ArrayBuffer> {
    this.#arrayBufferPromise ??= this.#response.clone().arrayBuffer();
    return this.#arrayBufferPromise;
  }

  response(): Response {
    return this.#response.clone();
  }

  async save(path: string): Promise<void> {
    await writeFile(path, new Uint8Array(await this.arrayBuffer()));
  }

  async assertNoTapServiceError(): Promise<void> {
    const contentType = this.contentType?.toLowerCase() ?? "";

    if (
      this.format !== "votable" &&
      !contentType.includes("votable") &&
      !contentType.includes("xml")
    ) {
      return;
    }

    const queryStatus = await this.#queryStatus();

    if (queryStatus?.value?.toUpperCase() === "ERROR") {
      throw new TapServiceError(
        `TAP service error: ${queryStatus.message ?? "QUERY_STATUS ERROR"}`,
      );
    }
  }

  async #votable(): Promise<VotableDocument> {
    this.#votablePromise ??= this.text().then(parseVotable);
    return this.#votablePromise;
  }

  async #queryStatus(): Promise<VotableInfo | undefined> {
    this.#queryStatusPromise ??= this.text().then(
      (text) => parseVotableStatus(text).queryStatus,
    );
    return this.#queryStatusPromise;
  }

  async *#rows(): AsyncIterable<TapRow> {
    for (const row of await this.#parseRows("rows")) {
      yield row;
    }
  }

  async #parseRows(helper: "json" | "rows"): Promise<TapRow[]> {
    this.#assertRowsSupported(helper);

    if (this.#isVotableLike()) {
      return (await this.#votable()).rows;
    }

    return (await this.#delimited()).rows;
  }

  async #delimited(): Promise<ParsedDelimitedTable> {
    this.#delimitedPromise ??= this.text().then((text) =>
      parseDelimitedTable(this.format, text),
    );
    return this.#delimitedPromise;
  }

  #assertRowsSupported(helper: "json" | "rows"): void {
    if (
      this.format !== "votable" &&
      this.format !== "csv" &&
      this.format !== "tsv" &&
      !this.#isVotableLike()
    ) {
      throw this.#unsupportedHelper(helper);
    }
  }

  #isVotableLike(): boolean {
    return isVotableFormat(this.format, this.contentType);
  }

  #unsupportedHelper(helper: "json" | "rows"): TapFormatUnsupportedError {
    return new TapFormatUnsupportedError(
      `TapResult.${helper}() does not support ${this.format} results in this implementation slice.`,
    );
  }
}

function toResultField(field: VotableField): TapResultField {
  const result: TapResultField = { name: fieldKey(field) };

  assignIfDefined(result, "datatype", field.datatype);
  assignIfDefined(result, "unit", field.unit);
  assignIfDefined(result, "ucd", field.ucd);
  assignIfDefined(result, "utype", field.utype);
  assignIfDefined(result, "description", field.description);

  return result;
}

function assignIfDefined<TObject extends object, TKey extends keyof TObject>(
  object: TObject,
  key: TKey,
  value: TObject[TKey] | undefined,
): void {
  if (value !== undefined) {
    object[key] = value;
  }
}

function isVotableFormat(
  format: TapSyncFormat,
  contentType: string | undefined,
): boolean {
  const normalizedContentType = contentType?.toLowerCase() ?? "";

  return (
    format === "votable" ||
    normalizedContentType.includes("votable") ||
    normalizedContentType.includes("xml")
  );
}
