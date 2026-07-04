import {
  TapAuthUnsupportedError,
  TapFormatUnsupportedError,
  TapHttpError,
  TapParseError,
} from "./errors.js";
import {
  tapServiceFormats,
  type TapServiceFormat,
  type TapSyncFormat,
} from "./tap-format.js";
import { tapGet, type TapHttpRequestOptions } from "./tap-http.js";
import type { ResolvedTapTarget } from "./target-resolver.js";
import {
  descendants,
  directChildren,
  directChildText,
  firstDescendantText,
  nodeText,
  parseXml,
  type XmlNode,
} from "./xml-tree.js";

/** Common request options for TAP metadata operations. */
export type TapRequestOptions = {
  /** Abort signal for the metadata HTTP request. */
  signal?: AbortSignal;
};

/** Public TAP table metadata from VOSI `/tables`. */
export type TapTable = {
  /** Fully qualified TAP table name when provided by the service. */
  name: string;
  /** Human-readable table description, when provided. */
  description?: string;
  /** TAP schema name, when provided. */
  schema?: string;
};

/** Public TAP column metadata from VOSI `/tables`. */
export type TapColumn = {
  /** Column name. */
  name: string;
  /** TAP datatype, when provided. */
  datatype?: string;
  /** Unit string, when provided. */
  unit?: string;
  /** Unified Content Descriptor, when provided. */
  ucd?: string;
  /** Human-readable column description, when provided. */
  description?: string;
};

/** TAP capability summary used for format and auth preflight checks. */
export type TapCapabilities = {
  /** Advertised output formats normalized to Starfetch format names. */
  formats: TapServiceFormat[];
  /** Advertised query languages. */
  languages: string[];
  /** Anonymous/authentication support inferred from query interfaces. */
  auth: "anonymous" | "unsupported-auth" | "mixed" | "unknown";
};

/** TAP availability state from VOSI `/availability`. */
export type TapAvailability = {
  /** Whether the service reports itself as currently available. */
  available: boolean;
  /** Availability message, when provided. */
  message?: string;
};

/** Metadata request options used by lower-level helpers. */
export type TapMetadataOptions = TapRequestOptions & {
  /** Custom fetch implementation for tests or non-default runtimes. */
  fetch?: typeof fetch;
  /** User-Agent header for runtimes that allow callers to set it. */
  userAgent?: string;
};

type ParsedTable = TapTable & {
  columns: TapColumn[];
};

/** Read and summarize TAP `/capabilities` metadata. */
export async function readTapCapabilities(
  target: ResolvedTapTarget,
  options: TapMetadataOptions = {},
): Promise<TapCapabilities> {
  const xml = await readTapMetadataXml(target, "capabilities", options);
  return parseTapCapabilities(xml);
}

/** Read TAP `/availability` metadata. */
export async function readTapAvailability(
  target: ResolvedTapTarget,
  options: TapMetadataOptions = {},
): Promise<TapAvailability> {
  const xml = await readTapMetadataXml(target, "availability", options);
  return parseTapAvailability(xml);
}

/** Read public table metadata from TAP `/tables`. */
export async function readTapTables(
  target: ResolvedTapTarget,
  options: TapMetadataOptions = {},
): Promise<TapTable[]> {
  const tables = await readParsedTapTables(target, options);
  return tables.map((table) => {
    const publicTable: TapTable = { name: table.name };

    if (table.description !== undefined) {
      publicTable.description = table.description;
    }

    if (table.schema !== undefined) {
      publicTable.schema = table.schema;
    }

    return publicTable;
  });
}

/** Read columns for an exact table name from TAP `/tables`. */
export async function readTapColumns(
  target: ResolvedTapTarget,
  tableName: string,
  options: TapMetadataOptions = {},
): Promise<TapColumn[]> {
  const tables = await readParsedTapTables(target, options);
  return tables.find((table) => table.name === tableName)?.columns ?? [];
}

/**
 * Reject targets whose capabilities clearly advertise only unsupported auth.
 */
export async function assertAnonymousTapSupported(
  target: ResolvedTapTarget,
  options: TapMetadataOptions = {},
): Promise<void> {
  const capabilities = await readTapCapabilitiesIfAvailable(target, options);

  if (capabilities === undefined) {
    return;
  }

  assertCapabilitiesAllowAnonymousTap(capabilities);
}

/**
 * Reject sync queries when capabilities prove auth or format incompatibility.
 */
export async function assertTapSyncQuerySupported(
  target: ResolvedTapTarget,
  format: TapSyncFormat,
  options: TapMetadataOptions = {},
): Promise<void> {
  const capabilities = await readTapCapabilitiesIfAvailable(target, options);

  if (capabilities === undefined) {
    return;
  }

  assertCapabilitiesAllowAnonymousTap(capabilities);

  if (
    capabilities.formats.length > 0 &&
    !capabilities.formats.includes(format)
  ) {
    throw new TapFormatUnsupportedError(
      `TAP service capabilities do not advertise support for ${format} output.`,
    );
  }
}

async function readTapCapabilitiesIfAvailable(
  target: ResolvedTapTarget,
  options: TapMetadataOptions,
): Promise<TapCapabilities | undefined> {
  let capabilities: TapCapabilities;

  try {
    capabilities = await readTapCapabilities(target, options);
  } catch (error) {
    if (error instanceof TapHttpError || error instanceof TapParseError) {
      return undefined;
    }

    throw error;
  }

  return capabilities;
}

function assertCapabilitiesAllowAnonymousTap(
  capabilities: TapCapabilities,
): void {
  if (capabilities.auth === "unsupported-auth") {
    throw new TapAuthUnsupportedError(
      "This TAP query interface requires authentication, but Starfetch v1 only supports anonymous TAP requests.",
    );
  }
}

async function readParsedTapTables(
  target: ResolvedTapTarget,
  options: TapMetadataOptions,
): Promise<ParsedTable[]> {
  const xml = await readTapMetadataXml(target, "tables", options);
  return parseTapTables(xml);
}

async function readTapMetadataXml(
  target: ResolvedTapTarget,
  resource: "availability" | "capabilities" | "tables",
  options: TapMetadataOptions,
): Promise<string> {
  const response = await tapGet(
    target.baseUrl,
    resource,
    createHttpOptions(options),
  );
  return response.text();
}

function createHttpOptions(options: TapMetadataOptions): TapHttpRequestOptions {
  const httpOptions: TapHttpRequestOptions = {};

  if (options.fetch !== undefined) {
    httpOptions.fetch = options.fetch;
  }

  if (options.signal !== undefined) {
    httpOptions.signal = options.signal;
  }

  if (options.userAgent !== undefined) {
    httpOptions.userAgent = options.userAgent;
  }

  return httpOptions;
}

function parseTapAvailability(xml: string): TapAvailability {
  const root = parseXml(xml);
  const availableText = firstDescendantText(root, "available")?.toLowerCase();
  const available = availableText === "true" || availableText === "1";
  const message =
    firstDescendantText(root, "note") ?? firstDescendantText(root, "message");
  const availability: TapAvailability = { available };

  if (message !== undefined) {
    availability.message = message;
  }

  return availability;
}

function parseTapCapabilities(xml: string): TapCapabilities {
  const root = parseXml(xml);
  const tapCapability = descendants(root, "capability").find((capability) =>
    isTapCapability(capability),
  );

  if (tapCapability === undefined) {
    return { auth: "unknown", formats: [], languages: [] };
  }

  return {
    auth: classifyTapAuth(tapCapability),
    formats: parseFormats(tapCapability),
    languages: parseLanguages(tapCapability),
  };
}

function parseTapTables(xml: string): ParsedTable[] {
  const root = parseXml(xml);
  const tables: ParsedTable[] = [];

  for (const schemaNode of descendants(root, "schema")) {
    const schema = directChildText(schemaNode, "name");

    for (const tableNode of directChildren(schemaNode, "table")) {
      const name = directChildText(tableNode, "name");

      if (name === undefined) {
        continue;
      }

      const table: ParsedTable = {
        columns: parseColumns(tableNode),
        name,
      };
      const description = directChildText(tableNode, "description");

      if (description !== undefined) {
        table.description = description;
      }

      if (schema !== undefined) {
        table.schema = schema;
      }

      tables.push(table);
    }
  }

  return tables;
}

function parseColumns(tableNode: XmlNode): TapColumn[] {
  return directChildren(tableNode, "column").flatMap((columnNode) => {
    const name = directChildText(columnNode, "name");

    if (name === undefined) {
      return [];
    }

    const column: TapColumn = { name };
    const datatype = directChildText(columnNode, "dataType");
    const unit = directChildText(columnNode, "unit");
    const ucd = directChildText(columnNode, "ucd");
    const description = directChildText(columnNode, "description");

    if (datatype !== undefined) {
      column.datatype = datatype;
    }

    if (unit !== undefined) {
      column.unit = unit;
    }

    if (ucd !== undefined) {
      column.ucd = ucd;
    }

    if (description !== undefined) {
      column.description = description;
    }

    return [column];
  });
}

function isTapCapability(capability: XmlNode): boolean {
  const standardId = capability.attributes.standardid?.toLowerCase();
  return standardId === "ivo://ivoa.net/std/tap";
}

function classifyTapAuth(tapCapability: XmlNode): TapCapabilities["auth"] {
  const interfaces = directChildren(tapCapability, "interface");

  if (interfaces.length === 0) {
    return "unknown";
  }

  const anonymousCount = interfaces.filter((interfaceNode) =>
    isAnonymousInterface(interfaceNode),
  ).length;
  const securedCount = interfaces.length - anonymousCount;

  if (anonymousCount > 0 && securedCount > 0) {
    return "mixed";
  }

  if (anonymousCount > 0) {
    return "anonymous";
  }

  return "unsupported-auth";
}

function isAnonymousInterface(interfaceNode: XmlNode): boolean {
  const securityMethods = directChildren(interfaceNode, "securityMethod");

  if (securityMethods.length === 0) {
    return true;
  }

  return securityMethods.some((securityMethod) => {
    const standardId = securityMethod.attributes.standardid?.toLowerCase();
    return standardId === undefined || standardId.includes("anonymous");
  });
}

function parseLanguages(tapCapability: XmlNode): string[] {
  const languages = directChildren(tapCapability, "language")
    .map((language) => directChildText(language, "name"))
    .filter((language): language is string => language !== undefined);

  return unique(languages);
}

function parseFormats(tapCapability: XmlNode): TapServiceFormat[] {
  const formats = new Set<TapServiceFormat>();

  for (const outputFormat of directChildren(tapCapability, "outputFormat")) {
    for (const value of outputFormatValues(outputFormat)) {
      const format = mapOutputFormat(value);

      if (format !== undefined) {
        formats.add(format);
      }
    }
  }

  return tapServiceFormats.filter((format) => formats.has(format));
}

function outputFormatValues(outputFormat: XmlNode): string[] {
  return [
    ...directChildren(outputFormat, "mime"),
    ...directChildren(outputFormat, "alias"),
  ].map((node) => nodeText(node).toLowerCase());
}

function mapOutputFormat(value: string): TapServiceFormat | undefined {
  if (value.includes("votable")) {
    return "votable";
  }

  if (value === "csv" || value.includes("text/csv")) {
    return "csv";
  }

  if (
    value === "tsv" ||
    value.includes("tab-separated-values") ||
    value.includes("text/tab")
  ) {
    return "tsv";
  }

  if (value === "json" || value.includes("application/json")) {
    return "json";
  }

  if (value === "jsonl" || value.includes("json-seq")) {
    return "jsonl";
  }

  if (value === "text" || value.includes("text/plain")) {
    return "text";
  }

  return undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
