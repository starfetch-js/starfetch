import { z } from "zod/v4";

export const STARFETCH_TABLE_VIEW_LIMITS_V1 = {
  maxCells: 3_200,
  maxColumns: 32,
  maxRows: 100,
  maxSerializedBytes: 65_536,
  maxStringBytes: 4_096,
} as const;

export type StarfetchPresentationErrorCode =
  | "INVALID_SOURCE"
  | "UNSUPPORTED_FORMAT"
  | "VALUE_TOO_LONG";

export class StarfetchPresentationError extends Error {
  readonly code: StarfetchPresentationErrorCode;

  constructor(code: StarfetchPresentationErrorCode, message: string) {
    super(message);
    this.name = "StarfetchPresentationError";
    this.code = code;
  }
}

const jsonScalarSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const tableColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  datatype: z.string().optional(),
  unit: z.string().optional(),
  ucd: z.string().optional(),
  utype: z.string().optional(),
  description: z.string().optional(),
});

const targetSchema = z.object({
  baseUrl: z.string(),
  label: z.string().optional(),
  service: z.string().optional(),
});

const syncFormatSchema = z.enum(["csv", "tsv", "votable"]);

const sourceSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("starfetch_list_presets") }),
  z.object({
    tool: z.literal("starfetch_registry_search"),
    registryUrl: z.string(),
  }),
  z.object({
    tool: z.literal("starfetch_tap_tables"),
    target: targetSchema,
  }),
  z.object({
    tool: z.literal("starfetch_tap_columns"),
    table: z.string(),
    target: targetSchema,
  }),
  z.object({
    tool: z.literal("starfetch_tap_query"),
    durationMs: z.number().nonnegative(),
    query: z.string(),
    effectiveMaxrec: z.number().int().nonnegative(),
    format: z.literal("json"),
    overflow: z.boolean().optional(),
    requestFormat: syncFormatSchema,
    runId: z.string().optional(),
    target: targetSchema,
  }),
  z.object({
    tool: z.literal("starfetch_tap_job_fetch"),
    durationMs: z.number().nonnegative(),
    format: z.literal("json"),
    overflow: z.boolean().optional(),
    requestFormat: syncFormatSchema,
    sourceFormat: syncFormatSchema,
    job: z.object({
      id: z.string(),
      url: z.string(),
    }),
    target: targetSchema,
  }),
]);

const resultKindByTool = {
  starfetch_list_presets: "presets",
  starfetch_registry_search: "registry-services",
  starfetch_tap_columns: "columns",
  starfetch_tap_job_fetch: "async-query-rows",
  starfetch_tap_query: "query-rows",
  starfetch_tap_tables: "tables",
} as const;

export const starfetchTableViewV1Schema = z
  .object({
    contractVersion: z.literal(1),
    resultKind: z.enum([
      "async-query-rows",
      "columns",
      "presets",
      "query-rows",
      "registry-services",
      "tables",
    ]),
    title: z.string(),
    columns: z
      .array(tableColumnSchema)
      .max(STARFETCH_TABLE_VIEW_LIMITS_V1.maxColumns),
    rows: z
      .array(z.record(z.string(), jsonScalarSchema))
      .max(STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows),
    source: sourceSchema,
    state: z.enum(["empty", "populated"]),
    clipping: z.object({
      reasons: z.array(z.enum(["bytes", "columns", "rows"])),
      sourceRows: z.number().int().nonnegative(),
      sourceColumns: z.number().int().nonnegative(),
    }),
  })
  .superRefine((view, context) => {
    const expectedKind = resultKindByTool[view.source.tool];
    if (view.resultKind !== expectedKind) {
      context.addIssue({
        code: "custom",
        message: "Result kind does not match the source tool.",
        path: ["resultKind"],
      });
    }

    const columnKeys = view.columns.map((column) => column.key);
    if (new Set(columnKeys).size !== columnKeys.length) {
      context.addIssue({
        code: "custom",
        message: "Table view column keys must be unique.",
        path: ["columns"],
      });
    }
    for (const [index, row] of view.rows.entries()) {
      if (
        Object.keys(row).length !== columnKeys.length ||
        columnKeys.some((key) => !(key in row))
      ) {
        context.addIssue({
          code: "custom",
          message: "Table view rows must match the ordered columns.",
          path: ["rows", index],
        });
      }
    }

    const expectedState =
      view.clipping.sourceRows === 0 ? "empty" : "populated";
    if (view.state !== expectedState) {
      context.addIssue({
        code: "custom",
        message: "Table view state does not match its source row count.",
        path: ["state"],
      });
    }
    const rowClippingApplied = view.clipping.sourceRows > view.rows.length;
    const columnClippingApplied =
      view.clipping.sourceColumns > view.columns.length;
    const clippingApplied = rowClippingApplied || columnClippingApplied;
    const reasons = new Set(view.clipping.reasons);
    const reasonsMatchClipping =
      (!rowClippingApplied || reasons.has("rows") || reasons.has("bytes")) &&
      (!columnClippingApplied ||
        reasons.has("columns") ||
        reasons.has("bytes")) &&
      (rowClippingApplied || !reasons.has("rows")) &&
      (columnClippingApplied || !reasons.has("columns")) &&
      (clippingApplied || !reasons.has("bytes"));

    if (
      view.clipping.sourceRows < view.rows.length ||
      view.clipping.sourceColumns < view.columns.length ||
      reasons.size !== view.clipping.reasons.length ||
      !reasonsMatchClipping
    ) {
      context.addIssue({
        code: "custom",
        message: "Table view clipping metadata is inconsistent.",
        path: ["clipping"],
      });
    }

    if (
      (view.resultKind === "query-rows" ||
        view.resultKind === "async-query-rows") &&
      view.rows.some((row) =>
        Object.values(row).some(
          (value) => value !== null && typeof value !== "string",
        ),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Scientific row values must be strings or null.",
        path: ["rows"],
      });
    }

    if (
      view.rows.length * view.columns.length >
      STARFETCH_TABLE_VIEW_LIMITS_V1.maxCells
    ) {
      context.addIssue({
        code: "custom",
        message: "Table view exceeds the cell ceiling.",
        path: ["rows"],
      });
    }

    if (containsOverlongString(view)) {
      context.addIssue({
        code: "custom",
        message: "Table view contains an overlong string.",
      });
    }

    if (
      serializedByteLength(view) >
      STARFETCH_TABLE_VIEW_LIMITS_V1.maxSerializedBytes
    ) {
      context.addIssue({
        code: "custom",
        message: "Table view exceeds the serialized byte ceiling.",
      });
    }
  });

export type StarfetchTableViewV1 = z.infer<typeof starfetchTableViewV1Schema>;

export type StarfetchTableViewDraft = Pick<
  StarfetchTableViewV1,
  "columns" | "resultKind" | "rows" | "source" | "title"
>;

export function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export function containsOverlongString(value: unknown): boolean {
  if (typeof value === "string") {
    return (
      new TextEncoder().encode(value).byteLength >
      STARFETCH_TABLE_VIEW_LIMITS_V1.maxStringBytes
    );
  }

  if (Array.isArray(value)) {
    return value.some(containsOverlongString);
  }

  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).some(containsOverlongString)
  );
}
