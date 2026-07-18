import {
  containsOverlongString,
  serializedByteLength,
  STARFETCH_TABLE_VIEW_LIMITS_V1,
  STARFETCH_WIDGET_TABLE_LIMITS_V1,
  StarfetchPresentationError,
  starfetchTableViewV1Schema,
  starfetchWidgetTableDatasetV1Schema,
  type StarfetchTableViewDraft,
  type StarfetchTableViewLimits,
  type StarfetchTableViewV1,
  type StarfetchWidgetTableDatasetV1,
} from "./presentation-contract.js";

export function finalizeStarfetchTableView(
  draft: StarfetchTableViewDraft,
): StarfetchTableViewV1 {
  return finalizeTableView(draft, STARFETCH_TABLE_VIEW_LIMITS_V1, (view) =>
    starfetchTableViewV1Schema.parse(view),
  );
}

export function finalizeStarfetchWidgetTableDataset(
  draft: StarfetchTableViewDraft,
): StarfetchWidgetTableDatasetV1 {
  const view = finalizeTableView(
    draft,
    STARFETCH_WIDGET_TABLE_LIMITS_V1,
    (candidate) =>
      starfetchWidgetTableDatasetV1Schema.parse({
        datasetVersion: 1,
        view: candidate,
      }).view,
  );
  return { datasetVersion: 1, view };
}

function finalizeTableView(
  draft: StarfetchTableViewDraft,
  limits: StarfetchTableViewLimits,
  parse: (view: StarfetchTableViewV1) => StarfetchTableViewV1,
): StarfetchTableViewV1 {
  const sourceColumns = draft.columns.length;
  const sourceRows = draft.rows.length;
  let columns = draft.columns.slice(0, limits.maxColumns);
  let rows = draft.rows
    .slice(0, limits.maxRows)
    .map((row) => selectColumns(row, columns));
  const reasons: StarfetchTableViewV1["clipping"]["reasons"] = [];

  if (columns.length < sourceColumns) reasons.push("columns");
  if (rows.length < sourceRows) reasons.push("rows");

  if (
    containsOverlongString(
      {
        columns,
        rows,
        source: draft.source,
        title: draft.title,
      },
      limits.maxStringBytes,
    )
  ) {
    throw new StarfetchPresentationError(
      "VALUE_TOO_LONG",
      "Table presentation cannot preserve an overlong string value.",
    );
  }

  const view: StarfetchTableViewV1 = {
    ...draft,
    clipping: {
      reasons,
      sourceColumns,
      sourceRows,
    },
    columns,
    contractVersion: 1,
    rows,
    state: sourceRows === 0 ? "empty" : "populated",
  };

  if (serializedByteLength(view) > limits.maxSerializedBytes) {
    reasons.push("bytes");

    let minimum = 0;
    let maximum = rows.length;
    while (minimum < maximum) {
      const candidateLength = Math.ceil((minimum + maximum) / 2);
      view.rows = rows.slice(0, candidateLength);
      if (serializedByteLength(view) <= limits.maxSerializedBytes) {
        minimum = candidateLength;
      } else {
        maximum = candidateLength - 1;
      }
    }
    rows = rows.slice(0, minimum);
    view.rows = rows;

    while (
      columns.length > 0 &&
      serializedByteLength(view) > limits.maxSerializedBytes
    ) {
      columns = columns.slice(0, -1);
      rows = rows.map((row) => selectColumns(row, columns));
      view.columns = columns;
      view.rows = rows;
    }
  }

  return parse(view);
}

function selectColumns(
  row: StarfetchTableViewV1["rows"][number],
  columns: StarfetchTableViewV1["columns"],
): StarfetchTableViewV1["rows"][number] {
  return Object.fromEntries(
    columns.map((column) => [column.key, row[column.key] ?? null]),
  );
}
