import { TapFormatUnsupportedError, TapParseError } from "./errors.js";
import {
  decodeVotableBinaryRows,
  type VotableBinaryField,
} from "./votable-binary.js";
import {
  descendants,
  directChildren,
  directChildText,
  nodeText,
  parseXml,
  type XmlNode,
} from "./xml-tree.js";

/** Cell value exposed by Starfetch's VOTable row parser. */
export type VotableCellValue = string | null;

/** Row object exposed by Starfetch's VOTable row parser. */
export type VotableRow = Record<string, VotableCellValue>;

/** VOTable FIELD metadata preserved by Starfetch. */
export type VotableField = {
  /** FIELD `name` attribute. */
  name?: string;
  /** FIELD `ID` attribute. */
  id?: string;
  /** FIELD `datatype` attribute. */
  datatype?: string;
  /** FIELD `arraysize` attribute. */
  arraysize?: string;
  /** FIELD `unit` attribute. */
  unit?: string;
  /** FIELD `ucd` attribute. */
  ucd?: string;
  /** FIELD `utype` attribute. */
  utype?: string;
  /** FIELD description text, when present. */
  description?: string;
};

/** VOTable INFO metadata, including TAP `QUERY_STATUS`. */
export type VotableInfo = {
  /** INFO `name` attribute. */
  name: string;
  /** INFO `value` attribute. */
  value?: string;
  /** INFO element text, when present. */
  message?: string;
};

/** Parsed subset of a TAP VOTable result. */
export type VotableDocument = {
  /** FIELD metadata from the result table. */
  fields: VotableField[];
  /** Result rows keyed by FIELD name or ID. */
  rows: VotableRow[];
  /** INFO elements from the document. */
  infos: VotableInfo[];
  /** Preferred TAP `QUERY_STATUS` INFO, when present. */
  queryStatus?: VotableInfo;
};

const unsupportedSerializations = ["FITS"] as const;

/**
 * Parse supported TAP VOTable result rows and metadata.
 *
 * Supports TABLEDATA and inline base64 BINARY/BINARY2 serializations. FITS,
 * remote streams, compressed streams, and datatype coercion are not supported.
 *
 * @throws TapParseError when XML or required VOTable structure is invalid.
 * @throws TapFormatUnsupportedError when the row serialization is unsupported.
 */
export function parseVotable(xml: string): VotableDocument {
  const { infos, queryStatus, root } = parseVotableStatus(xml);
  const table = findResultTable(root);

  if (table === undefined) {
    if (queryStatus?.value?.toUpperCase() === "ERROR") {
      return createDocument([], [], infos, queryStatus);
    }

    throw new TapParseError("VOTable did not contain a result TABLE");
  }

  const parsedFields = directChildren(table, "FIELD").map(parseField);
  const rows = parseRows(table, parsedFields);

  return createDocument(
    parsedFields.map((field) => field.metadata),
    rows,
    infos,
    queryStatus,
  );
}

/** Parse VOTable INFO status metadata without requiring a result table. */
export function parseVotableStatus(
  xml: string,
): Pick<VotableDocument, "infos" | "queryStatus"> & { root: XmlNode } {
  const root = parseXml(xml);

  if (!isLocal(root, "VOTABLE")) {
    throw new TapParseError("VOTable XML did not contain a VOTABLE root");
  }

  const infos = parseInfos(root);
  const queryStatus = findQueryStatus(infos);

  return createStatusDocument(root, infos, queryStatus);
}

function parseInfos(root: XmlNode): VotableInfo[] {
  return descendants(root, "INFO").map((info) => {
    const parsed: VotableInfo = {
      name: info.attributes.name ?? "",
    };
    const message = nodeText(info);

    if (info.attributes.value !== undefined) {
      parsed.value = info.attributes.value;
    }

    if (message.length > 0) {
      parsed.message = message;
    }

    return parsed;
  });
}

function findQueryStatus(infos: VotableInfo[]): VotableInfo | undefined {
  const statuses = infos.filter((info) =>
    equalsIgnoreCase(info.name, "QUERY_STATUS"),
  );

  return (
    statuses.find((info) => equalsIgnoreCase(info.value, "ERROR")) ??
    statuses.find((info) => equalsIgnoreCase(info.value, "OVERFLOW")) ??
    statuses.find((info) => equalsIgnoreCase(info.value, "OK")) ??
    statuses[0]
  );
}

function findResultTable(root: XmlNode): XmlNode | undefined {
  const resultResource = descendants(root, "RESOURCE").find((resource) =>
    equalsIgnoreCase(resource.attributes.type, "results"),
  );
  const searchRoot = resultResource ?? root;

  return descendants(searchRoot, "TABLE")[0];
}

function parseField(field: XmlNode): VotableBinaryField {
  const metadata: VotableField = {};
  const description = directChildText(field, "DESCRIPTION");
  const nullValue = directChildren(field, "VALUES")[0]?.attributes.null;

  assignIfPresent(metadata, "name", field.attributes.name);
  assignIfPresent(metadata, "id", field.attributes.id);
  assignIfPresent(metadata, "datatype", field.attributes.datatype);
  assignIfPresent(metadata, "arraysize", field.attributes.arraysize);
  assignIfPresent(metadata, "unit", field.attributes.unit);
  assignIfPresent(metadata, "ucd", field.attributes.ucd);
  assignIfPresent(metadata, "utype", field.attributes.utype);
  assignIfPresent(metadata, "description", description);

  if (nullValue === undefined) {
    return { metadata };
  }

  return { metadata, nullValue };
}

function parseRows(table: XmlNode, fields: VotableBinaryField[]): VotableRow[] {
  const keys = fields.map((field) => fieldKey(field.metadata));
  assertUniqueFieldKeys(keys);
  const data = directChildren(table, "DATA")[0];

  if (data === undefined) {
    throw new TapParseError("VOTable result TABLE did not contain DATA");
  }

  const tabledata = directChildren(data, "TABLEDATA")[0];

  if (tabledata === undefined) {
    const binary = directChildren(data, "BINARY")[0];
    if (binary !== undefined) {
      return decodeVotableBinaryRows("BINARY", binary, fields, keys);
    }

    const binary2 = directChildren(data, "BINARY2")[0];
    if (binary2 !== undefined) {
      return decodeVotableBinaryRows("BINARY2", binary2, fields, keys);
    }

    assertNoUnsupportedSerialization(data);
    throw new TapParseError("VOTable result DATA did not contain TABLEDATA");
  }

  return directChildren(tabledata, "TR").map((row) => parseRow(row, keys));
}

function parseRow(row: XmlNode, keys: string[]): VotableRow {
  const cells = directChildren(row, "TD");

  if (cells.length !== keys.length) {
    throw new TapParseError(
      `VOTable TABLEDATA row had ${cells.length} cells for ${keys.length} fields`,
    );
  }

  const values: VotableRow = {};

  for (const [index, key] of keys.entries()) {
    const value = cellText(cells[index] as XmlNode);
    values[key] = value === "" ? null : value;
  }

  return values;
}

function assertUniqueFieldKeys(keys: string[]): void {
  const seen = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) {
      throw new TapParseError(`VOTable FIELD key is duplicated: ${key}`);
    }

    seen.add(key);
  }
}

function cellText(cell: XmlNode): string {
  return cell.text;
}

function fieldKey(field: VotableField): string {
  const key = field.name ?? field.id;

  if (key === undefined || key.length === 0) {
    throw new TapParseError("VOTable FIELD must include name or ID");
  }

  return key;
}

function assertNoUnsupportedSerialization(data: XmlNode): void {
  for (const serialization of unsupportedSerializations) {
    if (directChildren(data, serialization).length > 0) {
      throw new TapFormatUnsupportedError(
        `VOTable ${serialization} row decoding is not supported in this implementation slice.`,
      );
    }
  }
}

function createDocument(
  fields: VotableField[],
  rows: VotableRow[],
  infos: VotableInfo[],
  queryStatus: VotableInfo | undefined,
): VotableDocument {
  const document: VotableDocument = { fields, rows, infos };

  if (queryStatus !== undefined) {
    document.queryStatus = queryStatus;
  }

  return document;
}

function createStatusDocument(
  root: XmlNode,
  infos: VotableInfo[],
  queryStatus: VotableInfo | undefined,
): Pick<VotableDocument, "infos" | "queryStatus"> & { root: XmlNode } {
  const document: Pick<VotableDocument, "infos" | "queryStatus"> & {
    root: XmlNode;
  } = { infos, root };

  if (queryStatus !== undefined) {
    document.queryStatus = queryStatus;
  }

  return document;
}

function assignIfPresent<Key extends keyof VotableField>(
  field: VotableField,
  key: Key,
  value: VotableField[Key] | undefined,
): void {
  if (value !== undefined) {
    field[key] = value;
  }
}

function equalsIgnoreCase(
  left: string | undefined,
  right: string | undefined,
): boolean {
  return left?.toLowerCase() === right?.toLowerCase();
}

function isLocal(node: XmlNode, local: string): boolean {
  return node.local.toLowerCase() === local.toLowerCase();
}
