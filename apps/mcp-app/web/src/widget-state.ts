import {
  starfetchTableViewV1Schema,
  starfetchWidgetTableDatasetV1Schema,
  type StarfetchTableViewV1,
} from "../../src/presentation-contract.js";

export type DecodedTableView =
  | Readonly<{ ok: true; view: StarfetchTableViewV1 }>
  | Readonly<{ ok: false; message: string }>;

export function decodeTableView(
  value: unknown,
  metadata?: unknown,
): DecodedTableView {
  const dataset = isRecord(metadata)
    ? starfetchWidgetTableDatasetV1Schema.safeParse(
        metadata.starfetchTableDataset,
      )
    : undefined;
  if (dataset?.success) {
    return { ok: true, view: dataset.data.view };
  }

  const parsed = starfetchTableViewV1Schema.safeParse(value);
  return parsed.success
    ? { ok: true, view: parsed.data }
    : {
        ok: false,
        message: "The host returned an invalid Starfetch table result.",
      };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
