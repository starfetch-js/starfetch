import {
  starfetchTableViewV1Schema,
  type StarfetchTableViewV1,
} from "../../src/presentation-contract.js";

export type DecodedTableView =
  | Readonly<{ ok: true; view: StarfetchTableViewV1 }>
  | Readonly<{ ok: false; message: string }>;

export function decodeTableView(value: unknown): DecodedTableView {
  const parsed = starfetchTableViewV1Schema.safeParse(value);
  return parsed.success
    ? { ok: true, view: parsed.data }
    : {
        ok: false,
        message: "The host returned an invalid Starfetch table result.",
      };
}
