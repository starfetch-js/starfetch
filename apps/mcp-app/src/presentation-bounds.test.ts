import { describe, expect, it } from "vitest";

import {
  createStarfetchTableView,
  createStarfetchWidgetTableDataset,
  STARFETCH_TABLE_VIEW_LIMITS_V1,
  StarfetchPresentationError,
  starfetchTableViewV1Schema,
  starfetchWidgetTableDatasetV1Schema,
} from "./presentation.js";

describe("Starfetch table view bounds", () => {
  it("keeps the model view small while retaining the widget-only dataset", () => {
    const source = {
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: JSON.stringify(
            Array.from({ length: 125 }, (_, index) => ({ id: String(index) })),
          ),
          fields: [{ name: "id" }],
          format: "json",
        },
        diagnostics: {
          durationMs: 1,
          effectiveMaxrec: 1_000,
          format: "json",
          query: "SELECT TOP 125 id FROM catalog",
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    };

    const modelView = createStarfetchTableView(source);
    const dataset = createStarfetchWidgetTableDataset(source);

    expect(modelView.rows).toHaveLength(100);
    expect(dataset.view.rows).toHaveLength(125);
    expect(starfetchTableViewV1Schema.safeParse(dataset.view).success).toBe(
      false,
    );
    expect(starfetchWidgetTableDatasetV1Schema.parse(dataset)).toEqual(dataset);
  });

  it("clips only whole trailing rows and columns in a deterministic order", () => {
    const sourceRow = Object.fromEntries(
      Array.from(
        { length: STARFETCH_TABLE_VIEW_LIMITS_V1.maxColumns + 1 },
        (_, index) => [`column_${String(index).padStart(2, "0")}`, "x"],
      ),
    );
    const input = {
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: JSON.stringify(
            Array.from(
              { length: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows + 1 },
              () => sourceRow,
            ),
          ),
          fields: Object.keys(sourceRow).map((name) => ({ name })),
          format: "json",
        },
        diagnostics: {
          durationMs: 1,
          effectiveMaxrec: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows + 1,
          format: "json",
          query: "SELECT * FROM wide_table",
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    };

    const first = createStarfetchTableView(input);
    const second = createStarfetchTableView(input);

    expect(first.clipping).toMatchObject({
      reasons: ["columns", "rows"],
      sourceColumns: STARFETCH_TABLE_VIEW_LIMITS_V1.maxColumns + 1,
      sourceRows: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows + 1,
    });
    expect(first.columns.at(-1)?.key).toBe("column_31");
    expect(first.rows).toHaveLength(STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows);
    expect(Object.keys(first.rows[0] ?? {})).toEqual(
      first.columns.map((column) => column.key),
    );
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("preserves exact strings at the byte ceiling and rejects longer values", () => {
    const exactValue = "😀".repeat(
      STARFETCH_TABLE_VIEW_LIMITS_V1.maxStringBytes / 4,
    );
    const createInput = (value: string) => ({
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: JSON.stringify([{ value }]),
          fields: [{ name: "value" }],
          format: "json",
        },
        diagnostics: {
          durationMs: 1,
          effectiveMaxrec: 1,
          format: "json",
          query: "SELECT TOP 1 value FROM exact_values",
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    });

    expect(createStarfetchTableView(createInput(exactValue)).rows).toEqual([
      { value: exactValue },
    ]);
    expect(() =>
      createStarfetchTableView(createInput(`${exactValue}a`)),
    ).toThrow(
      expect.objectContaining<Partial<StarfetchPresentationError>>({
        code: "VALUE_TOO_LONG",
      }),
    );
  });

  it("clips trailing rows until the serialized view fits its byte ceiling", () => {
    const value = "x".repeat(1_000);
    const view = createStarfetchTableView({
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: JSON.stringify(
            Array.from(
              { length: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows },
              (_, index) => ({
                value: `${String(index).padStart(3, "0")}${value}`,
              }),
            ),
          ),
          fields: [{ name: "value" }],
          format: "json",
        },
        diagnostics: {
          durationMs: 1,
          effectiveMaxrec: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows,
          format: "json",
          query: "SELECT value FROM large_rows",
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    });

    expect(view.clipping).toMatchObject({
      reasons: ["bytes"],
      sourceRows: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows,
    });
    expect(view.rows.length).toBeLessThan(
      STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows,
    );
    expect(view.clipping).not.toHaveProperty("serializedBytes");
    expect(
      new TextEncoder().encode(JSON.stringify(view)).byteLength,
    ).toBeLessThanOrEqual(STARFETCH_TABLE_VIEW_LIMITS_V1.maxSerializedBytes);
    expect(view.rows.at(-1)?.value).toBe(
      `${String(view.rows.length - 1).padStart(3, "0")}${value}`,
    );
  });

  it("rejects views with inconsistent bounded-state metadata", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_list_presets",
      structuredContent: {
        data: [],
        diagnostics: { count: 0 },
      },
    });

    expect(() =>
      starfetchTableViewV1Schema.parse({
        ...view,
        clipping: { ...view.clipping, sourceColumns: 3 },
      }),
    ).toThrow();
    expect(() =>
      starfetchTableViewV1Schema.parse({ ...view, state: "populated" }),
    ).toThrow();

    const hiddenClipping = {
      ...view,
      clipping: {
        ...view.clipping,
        sourceRows: 3,
      },
      state: "populated" as const,
    };
    expect(() => starfetchTableViewV1Schema.parse(hiddenClipping)).toThrow();

    const scientific = createStarfetchTableView({
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: '[{"source_id":"9007199254740993"}]',
          fields: [{ name: "source_id" }],
          format: "json",
        },
        diagnostics: {
          durationMs: 1,
          effectiveMaxrec: 1,
          format: "json",
          query: "SELECT TOP 1 source_id FROM catalog.sources",
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    });
    expect(() =>
      starfetchTableViewV1Schema.parse({
        ...scientific,
        rows: [{ source_id: Number("9007199254740993") }],
      }),
    ).toThrow();
  });
});
