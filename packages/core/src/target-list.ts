import { parse } from "csv-parse/sync";
import { TapUploadError } from "./errors.js";

const maxTargetRows = 10_000;

/** Convert a single identifier column with a CSV header into a TAP upload. */
export function prepareTargetList(csv: string, idType: "text" | "long") {
  let records: string[][];
  try {
    records = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      to: maxTargetRows + 2,
    });
  } catch (error) {
    throw new TapUploadError(`Invalid target CSV: ${String(error)}`);
  }
  const [header, ...rows] = records;
  if (header?.length !== 1 || !header[0]?.trim() || rows.length === 0) {
    throw new TapUploadError(
      "Expected one CSV column with a header and at least one identifier.",
    );
  }
  if (rows.length > maxTargetRows) {
    throw new TapUploadError(
      "A CSV target list accepts up to 10,000 identifiers.",
    );
  }
  const firstRows = new Map<string, number>();
  const data = rows.map(([id], index) => {
    const row = index + 1;
    if (
      !id?.trim() ||
      /[^\t\n\r\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(id)
    ) {
      throw new TapUploadError(
        `Empty or invalid identifier in input row ${row}.`,
      );
    }
    if (
      idType === "long" &&
      (id !== id.trim() ||
        !/^(?:0|-?[1-9]\d{0,18})$/.test(id) ||
        BigInt.asIntN(64, BigInt(id)) !== BigInt(id))
    ) {
      throw new TapUploadError(
        `Expected a canonical signed 64-bit integer in input row ${row}. Use text for identifiers with leading zeros.`,
      );
    }
    const first = firstRows.get(id);
    if (first === undefined) firstRows.set(id, row);
    const escaped = id
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\r", "&#13;");
    return `<TR><TD>${row}</TD><TD>${escaped}</TD><TD>${first ?? ""}</TD></TR>`;
  });
  const type =
    idType === "long"
      ? 'datatype="long"'
      : 'datatype="unicodeChar" arraysize="*"';
  const votable = `<VOTABLE xmlns="http://www.ivoa.net/xml/VOTable/v1.3" version="1.3"><RESOURCE><TABLE><FIELD name="input_row" datatype="int"/><FIELD name="target_id" ${type}/><FIELD name="duplicate_of" datatype="int"/><DATA><TABLEDATA>${data.join("")}</TABLEDATA></DATA></TABLE></RESOURCE></VOTABLE>`;
  return { votable, rowCount: rows.length };
}
