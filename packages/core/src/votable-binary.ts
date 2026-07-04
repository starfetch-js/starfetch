import { TapFormatUnsupportedError, TapParseError } from "./errors.js";
import { directChildren, nodeText, type XmlNode } from "./xml-tree.js";
import type { VotableCellValue, VotableField } from "./votable.js";

export type VotableBinaryField = {
  metadata: VotableField;
  nullValue?: string;
};

type Serialization = "BINARY" | "BINARY2";

type FieldShape = {
  field: VotableBinaryField;
  key: string;
  datatype: string;
  elementCount: number;
  variableLength: boolean;
};

export function decodeVotableBinaryRows(
  serialization: Serialization,
  node: XmlNode,
  fields: VotableBinaryField[],
  keys: string[],
): Record<string, VotableCellValue>[] {
  const bytes = readInlineBase64Stream(serialization, node);
  const shapes = fields.map((field, index) =>
    fieldShape(field, keys[index] as string),
  );

  if (shapes.length === 0 && bytes.length > 0) {
    throw new TapParseError(
      `VOTable ${serialization} contained binary row data but no FIELD metadata`,
    );
  }

  const rows: Record<string, VotableCellValue>[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    const rowOffset = offset;
    const row: Record<string, VotableCellValue> = {};
    let nullFlags: Uint8Array | undefined;

    if (serialization === "BINARY2") {
      const flagBytes = Math.floor((fields.length + 7) / 8);
      assertAvailable(bytes, offset, flagBytes);
      nullFlags = bytes.subarray(offset, offset + flagBytes);
      offset += flagBytes;
    }

    for (const [index, shape] of shapes.entries()) {
      const decoded = readCell(bytes, offset, shape);
      offset = decoded.offset;
      row[shape.key] =
        nullFlags !== undefined && isNullFlagSet(nullFlags, index)
          ? null
          : applyBinaryNull(shape.field, decoded.value);
    }

    if (offset === rowOffset) {
      throw new TapParseError("VOTable binary row decoding did not advance");
    }

    rows.push(row);
  }

  return rows;
}

function readInlineBase64Stream(
  serialization: Serialization,
  node: XmlNode,
): Uint8Array {
  const stream = directChildren(node, "STREAM")[0];

  if (stream === undefined) {
    throw new TapParseError(`VOTable ${serialization} did not contain STREAM`);
  }

  if (stream.attributes.href !== undefined) {
    throw new TapFormatUnsupportedError(
      `VOTable ${serialization} remote STREAM row decoding is not supported.`,
    );
  }

  const encoding = stream.attributes.encoding?.toLowerCase();
  if (encoding !== "base64") {
    throw new TapFormatUnsupportedError(
      `VOTable ${serialization} STREAM encoding ${encoding ?? "none"} is not supported.`,
    );
  }

  return decodeBase64(nodeText(stream));
}

function decodeBase64(text: string): Uint8Array {
  const normalized = text.replace(/\s+/g, "");
  let decoded: string;

  try {
    decoded = atob(normalized);
  } catch {
    throw new TapParseError(
      "Failed to decode VOTable binary STREAM base64 data",
    );
  }

  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
}

function fieldShape(field: VotableBinaryField, key: string): FieldShape {
  const datatype = field.metadata.datatype?.toLowerCase();

  if (datatype === undefined) {
    throw new TapParseError(
      "VOTable FIELD must include datatype for binary rows",
    );
  }

  const arraysize = parseArraySize(field.metadata.arraysize);

  return {
    datatype,
    elementCount: arraysize.elementCount,
    field,
    key,
    variableLength: arraysize.variableLength,
  };
}

function parseArraySize(arraysize: string | undefined): {
  elementCount: number;
  variableLength: boolean;
} {
  if (arraysize === undefined) {
    return { elementCount: 1, variableLength: false };
  }

  if (arraysize === "*") {
    return { elementCount: 1, variableLength: true };
  }

  const variableLength = arraysize.endsWith("*");
  const fixedPart = variableLength ? arraysize.slice(0, -1) : arraysize;
  const dimensions = fixedPart
    .split("x")
    .filter((part) => part.length > 0)
    .map((part) => Number(part));

  if (
    dimensions.length === 0 ||
    dimensions.some(
      (dimension) => !Number.isSafeInteger(dimension) || dimension <= 0,
    )
  ) {
    throw new TapParseError(`Invalid VOTable arraysize ${arraysize}`);
  }

  return {
    elementCount: dimensions.reduce((left, right) => left * right, 1),
    variableLength,
  };
}

function readCell(
  bytes: Uint8Array,
  offset: number,
  shape: FieldShape,
): { value: VotableCellValue; offset: number } {
  let elementCount = shape.elementCount;
  let nextOffset = offset;

  if (shape.variableLength) {
    assertAvailable(bytes, nextOffset, 4);
    elementCount = new DataView(
      bytes.buffer,
      bytes.byteOffset + nextOffset,
      4,
    ).getInt32(0, false);
    nextOffset += 4;

    if (elementCount < 0) {
      throw new TapParseError(
        "VOTable binary variable array length was negative",
      );
    }
  }

  return readFixedCell(bytes, nextOffset, shape.datatype, elementCount);
}

function readFixedCell(
  bytes: Uint8Array,
  offset: number,
  datatype: string,
  elementCount: number,
): { value: VotableCellValue; offset: number } {
  switch (datatype) {
    case "boolean":
      return readBoolean(bytes, offset, elementCount);
    case "bit":
      return readBits(bytes, offset, elementCount);
    case "unsignedbyte":
      return readArray(bytes, offset, elementCount, 1, (view, position) =>
        view.getUint8(position).toString(),
      );
    case "short":
      return readArray(bytes, offset, elementCount, 2, (view, position) =>
        view.getInt16(position, false).toString(),
      );
    case "int":
      return readArray(bytes, offset, elementCount, 4, (view, position) =>
        view.getInt32(position, false).toString(),
      );
    case "long":
      return readArray(bytes, offset, elementCount, 8, (view, position) =>
        view.getBigInt64(position, false).toString(),
      );
    case "float":
      return readArray(bytes, offset, elementCount, 4, (view, position) =>
        view.getFloat32(position, false).toString(),
      );
    case "double":
      return readArray(bytes, offset, elementCount, 8, (view, position) =>
        view.getFloat64(position, false).toString(),
      );
    case "floatcomplex":
      return readArray(bytes, offset, elementCount * 2, 4, (view, position) =>
        view.getFloat32(position, false).toString(),
      );
    case "doublecomplex":
      return readArray(bytes, offset, elementCount * 2, 8, (view, position) =>
        view.getFloat64(position, false).toString(),
      );
    case "char":
      return readAscii(bytes, offset, elementCount);
    case "unicodechar":
      return readUnicode(bytes, offset, elementCount);
    default:
      throw new TapFormatUnsupportedError(
        `VOTable binary datatype ${datatype} is not supported.`,
      );
  }
}

function readBoolean(
  bytes: Uint8Array,
  offset: number,
  elementCount: number,
): { value: VotableCellValue; offset: number } {
  assertAvailable(bytes, offset, elementCount);
  const values: string[] = [];

  for (let index = 0; index < elementCount; index += 1) {
    const byte = bytes[offset + index];
    const value = parseBooleanByte(byte);

    if (value === null) {
      if (elementCount === 1) {
        return { offset: offset + elementCount, value: null };
      }

      throw new TapFormatUnsupportedError(
        "VOTable BINARY boolean arrays with element-level nulls are not supported.",
      );
    }

    values.push(value);
  }

  return { offset: offset + elementCount, value: values.join(" ") };
}

function parseBooleanByte(byte: number | undefined): "true" | "false" | null {
  switch (byte) {
    case 84:
    case 116:
    case 49:
      return "true";
    case 70:
    case 102:
    case 48:
      return "false";
    case 0:
    case 32:
    case 63:
      return null;
    default:
      throw new TapParseError(`Invalid VOTable boolean byte ${byte}`);
  }
}

function readBits(
  bytes: Uint8Array,
  offset: number,
  bitCount: number,
): { value: string; offset: number } {
  const byteCount = Math.ceil(bitCount / 8);
  assertAvailable(bytes, offset, byteCount);
  let value = "";

  for (let bit = 0; bit < bitCount; bit += 1) {
    const byte = bytes[offset + Math.floor(bit / 8)] as number;
    const mask = 1 << (7 - (bit % 8));
    value += (byte & mask) === 0 ? "0" : "1";
  }

  return { offset: offset + byteCount, value };
}

function readArray(
  bytes: Uint8Array,
  offset: number,
  elementCount: number,
  elementBytes: number,
  read: (view: DataView, position: number) => string,
): { value: string; offset: number } {
  const byteCount = elementCount * elementBytes;
  assertAvailable(bytes, offset, byteCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, byteCount);
  const values: string[] = [];

  for (let index = 0; index < elementCount; index += 1) {
    values.push(read(view, index * elementBytes));
  }

  return {
    offset: offset + byteCount,
    value: values.join(" "),
  };
}

function readAscii(
  bytes: Uint8Array,
  offset: number,
  charCount: number,
): { value: string; offset: number } {
  assertAvailable(bytes, offset, charCount);
  let value = "";

  for (let index = 0; index < charCount; index += 1) {
    const byte = bytes[offset + index] as number;
    if (byte === 0) {
      break;
    }
    value += String.fromCharCode(byte);
  }

  return { offset: offset + charCount, value };
}

function readUnicode(
  bytes: Uint8Array,
  offset: number,
  charCount: number,
): { value: string; offset: number } {
  const byteCount = charCount * 2;
  assertAvailable(bytes, offset, byteCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, byteCount);
  let value = "";

  for (let index = 0; index < charCount; index += 1) {
    const code = view.getUint16(index * 2, false);
    if (code === 0) {
      break;
    }
    value += String.fromCharCode(code);
  }

  return { offset: offset + byteCount, value };
}

function isNullFlagSet(flags: Uint8Array, index: number): boolean {
  const byte = flags[Math.floor(index / 8)] as number;
  const mask = 1 << (7 - (index % 8));

  return (byte & mask) !== 0;
}

function applyBinaryNull(
  field: VotableBinaryField,
  value: VotableCellValue,
): VotableCellValue {
  return value !== null &&
    field.nullValue !== undefined &&
    value === field.nullValue
    ? null
    : value;
}

function assertAvailable(
  bytes: Uint8Array,
  offset: number,
  byteCount: number,
): void {
  if (offset + byteCount > bytes.length) {
    throw new TapParseError(
      "VOTable binary payload ended before row decoding completed",
    );
  }
}
