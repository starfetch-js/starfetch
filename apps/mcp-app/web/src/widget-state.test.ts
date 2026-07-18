import { describe, expect, it } from "vitest";

import type { StarfetchTableViewV1 } from "../../src/presentation-contract.js";
import { decodeTableView } from "./widget-state.js";

describe("decodeTableView", () => {
  it("accepts only the versioned bounded table contract", () => {
    const view: StarfetchTableViewV1 = {
      clipping: { reasons: [], sourceColumns: 1, sourceRows: 1 },
      columns: [{ key: "name", label: "Name" }],
      contractVersion: 1,
      resultKind: "presets",
      rows: [{ name: "gaia" }],
      source: { tool: "starfetch_list_presets" },
      state: "populated",
      title: "Starfetch TAP service presets",
    };

    expect(decodeTableView(view)).toEqual({ ok: true, view });
    expect(
      decodeTableView(
        { contractVersion: 2 },
        {
          starfetchTableDataset: {
            datasetVersion: 1,
            view,
          },
        },
      ),
    ).toEqual({ ok: true, view });
    expect(
      decodeTableView({ contractVersion: 2, secret: "do not echo" }),
    ).toEqual({
      message: "The host returned an invalid Starfetch table result.",
      ok: false,
    });
  });
});
