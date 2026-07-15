import {
  containsOverlongString,
  serializedByteLength,
  STARFETCH_TABLE_VIEW_LIMITS_V1,
  StarfetchPresentationError,
  starfetchTableViewV1Schema,
  type StarfetchTableViewDraft,
  type StarfetchTableViewV1,
} from "./presentation-contract.js";

export function finalizeStarfetchTableView(
  draft: StarfetchTableViewDraft,
): StarfetchTableViewV1 {
  const sourceColumns = draft.columns.length;
  const sourceRows = draft.rows.length;
  let columns = draft.columns.slice(
    0,
    STARFETCH_TABLE_VIEW_LIMITS_V1.maxColumns,
  );
  let rows = draft.rows
    .slice(0, STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows)
    .map((row) => selectColumns(row, columns));
  const reasons: StarfetchTableViewV1["clipping"]["reasons"] = [];

  if (columns.length < sourceColumns) reasons.push("columns");
  if (rows.length < sourceRows) reasons.push("rows");

  if (
    containsOverlongString({
      columns,
      rows,
      source: draft.source,
      title: draft.title,
    })
  ) {
    throw new StarfetchPresentationError(
      "VALUE_TOO_LONG",
      "Table presentation cannot preserve an overlong string value.",
    );
  }

  const view: StarfetchTableViewV1 = {
    ...draft,
    clipping: {
      applied: reasons.length > 0,
      includedColumns: columns.length,
      includedRows: rows.length,
      reasons,
      serializedBytes: 0,
      sourceColumns,
      sourceRows,
    },
    columns,
    contractVersion: 1,
    rows,
    state: sourceRows === 0 ? "empty" : "populated",
  };

  settleSerializedByteLength(view);

  if (
    view.clipping.serializedBytes >
    STARFETCH_TABLE_VIEW_LIMITS_V1.maxSerializedBytes
  ) {
    reasons.push("bytes");
    view.clipping.applied = true;

    while (
      rows.length > 0 &&
      view.clipping.serializedBytes >
        STARFETCH_TABLE_VIEW_LIMITS_V1.maxSerializedBytes
    ) {
      rows = rows.slice(0, -1);
      view.rows = rows;
      view.clipping.includedRows = rows.length;
      settleSerializedByteLength(view);
    }

    while (
      columns.length > 0 &&
      view.clipping.serializedBytes >
        STARFETCH_TABLE_VIEW_LIMITS_V1.maxSerializedBytes
    ) {
      columns = columns.slice(0, -1);
      rows = rows.map((row) => selectColumns(row, columns));
      view.columns = columns;
      view.rows = rows;
      view.clipping.includedColumns = columns.length;
      settleSerializedByteLength(view);
    }

    if (
      view.clipping.serializedBytes >
      STARFETCH_TABLE_VIEW_LIMITS_V1.maxSerializedBytes
    ) {
      throw new StarfetchPresentationError(
        "VIEW_TOO_LARGE",
        "Table presentation provenance exceeds the serialized byte ceiling.",
      );
    }
  }

  return starfetchTableViewV1Schema.parse(view);
}

function selectColumns(
  row: StarfetchTableViewV1["rows"][number],
  columns: StarfetchTableViewV1["columns"],
): StarfetchTableViewV1["rows"][number] {
  return Object.fromEntries(
    columns.map((column) => [column.key, row[column.key] ?? null]),
  );
}

function settleSerializedByteLength(view: StarfetchTableViewV1): void {
  let previous = -1;
  while (view.clipping.serializedBytes !== previous) {
    previous = view.clipping.serializedBytes;
    view.clipping.serializedBytes = serializedByteLength(view);
  }
}
