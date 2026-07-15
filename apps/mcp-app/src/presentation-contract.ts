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
  | "VALUE_TOO_LONG"
  | "VIEW_TOO_LARGE";

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
    query: z.string(),
    effectiveMaxrec: z.number().int().nonnegative(),
    format: z.literal("json"),
    requestFormat: syncFormatSchema,
    runId: z.string().optional(),
    target: targetSchema,
  }),
  z.object({
    tool: z.literal("starfetch_tap_job_fetch"),
    format: z.literal("json"),
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
      applied: z.boolean(),
      reasons: z.array(z.enum(["bytes", "columns", "rows"])),
      sourceRows: z.number().int().nonnegative(),
      includedRows: z.number().int().nonnegative(),
      sourceColumns: z.number().int().nonnegative(),
      includedColumns: z.number().int().nonnegative(),
      serializedBytes: z.number().int().nonnegative(),
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
    if (
      view.clipping.includedRows !== view.rows.length ||
      view.clipping.includedColumns !== view.columns.length ||
      view.clipping.sourceRows < view.clipping.includedRows ||
      view.clipping.sourceColumns < view.clipping.includedColumns ||
      view.clipping.applied !== view.clipping.reasons.length > 0 ||
      new Set(view.clipping.reasons).size !== view.clipping.reasons.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Table view clipping metadata is inconsistent.",
        path: ["clipping"],
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

    const serializedBytes = serializedByteLength(view);
    if (serializedBytes > STARFETCH_TABLE_VIEW_LIMITS_V1.maxSerializedBytes) {
      context.addIssue({
        code: "custom",
        message: "Table view exceeds the serialized byte ceiling.",
      });
    }
    if (view.clipping.serializedBytes !== serializedBytes) {
      context.addIssue({
        code: "custom",
        message: "Table view serialized byte count is not exact.",
        path: ["clipping", "serializedBytes"],
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
