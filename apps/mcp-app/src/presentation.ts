import { z } from "zod/v4";
import {
  StarfetchPresentationError,
  type StarfetchTableViewV1,
} from "./presentation-contract.js";
import { finalizeStarfetchTableView } from "./presentation-bounds.js";

export {
  STARFETCH_TABLE_VIEW_LIMITS_V1,
  StarfetchPresentationError,
  starfetchTableViewV1Schema,
  type StarfetchPresentationErrorCode,
  type StarfetchTableViewV1,
} from "./presentation-contract.js";

const presetResultSchema = z.object({
  sourceTool: z.literal("starfetch_list_presets"),
  structuredContent: z.object({
    data: z.array(
      z.object({
        name: z.string(),
        url: z.string(),
        label: z.string().optional(),
        syncRequest: z.literal("doQuery").optional(),
      }),
    ),
    diagnostics: z.object({ count: z.number().int().nonnegative() }),
  }),
});

const registryResultSchema = z.object({
  sourceTool: z.literal("starfetch_registry_search"),
  structuredContent: z.object({
    data: z.array(
      z.object({
        accessUrl: z.string(),
        description: z.string().optional(),
        ivoid: z.string(),
        shortName: z.string().optional(),
        standardId: z.string(),
        title: z.string(),
      }),
    ),
    diagnostics: z.object({
      count: z.number().int().nonnegative(),
      registryUrl: z.string(),
    }),
  }),
});

const targetSchema = z.object({
  baseUrl: z.string(),
  label: z.string().optional(),
  service: z.string().optional(),
});

const tablesResultSchema = z.object({
  sourceTool: z.literal("starfetch_tap_tables"),
  structuredContent: z.object({
    data: z.array(
      z.object({
        description: z.string().optional(),
        name: z.string(),
        schema: z.string().optional(),
      }),
    ),
    diagnostics: z.object({
      count: z.number().int().nonnegative(),
      target: targetSchema,
    }),
  }),
});

const columnsResultSchema = z.object({
  sourceTool: z.literal("starfetch_tap_columns"),
  structuredContent: z.object({
    data: z.array(
      z.object({
        datatype: z.string().optional(),
        description: z.string().optional(),
        name: z.string(),
        ucd: z.string().optional(),
        unit: z.string().optional(),
      }),
    ),
    diagnostics: z.object({
      count: z.number().int().nonnegative(),
      table: z.string(),
      target: targetSchema,
    }),
  }),
});

const syncFormatSchema = z.enum(["csv", "tsv", "votable"]);

const queryResultSchema = z.object({
  sourceTool: z.literal("starfetch_tap_query"),
  structuredContent: z.object({
    data: z.object({
      content: z.string(),
      format: z.literal("json"),
    }),
    diagnostics: z.object({
      effectiveMaxrec: z.number().int().nonnegative(),
      format: z.literal("json"),
      query: z.string(),
      requestFormat: syncFormatSchema,
      runId: z.string().optional(),
      target: targetSchema,
    }),
  }),
});

const jobFetchResultSchema = z.object({
  sourceTool: z.literal("starfetch_tap_job_fetch"),
  structuredContent: z.object({
    data: z.object({
      content: z.string(),
      format: z.literal("json"),
    }),
    diagnostics: z.object({
      format: z.literal("json"),
      job: z.object({
        id: z.string(),
        url: z.string(),
      }),
      requestFormat: syncFormatSchema,
      sourceFormat: syncFormatSchema,
      target: targetSchema,
    }),
  }),
});

const scientificRowsSchema = z.array(
  z.record(z.string(), z.union([z.string(), z.null()])),
);

export function createStarfetchTableView(input: unknown): StarfetchTableViewV1 {
  try {
    return createStarfetchTableViewUnchecked(input);
  } catch (error) {
    if (error instanceof StarfetchPresentationError) {
      throw error;
    }

    throw new StarfetchPresentationError(
      "INVALID_SOURCE",
      "Canonical Starfetch result cannot be presented.",
    );
  }
}

function createStarfetchTableViewUnchecked(
  input: unknown,
): StarfetchTableViewV1 {
  const sourceTool = z
    .object({ sourceTool: z.string() })
    .parse(input).sourceTool;
  if (sourceTool === "starfetch_registry_search") {
    const parsed = registryResultSchema.parse(input);
    const columns: StarfetchTableViewV1["columns"] = [
      { key: "shortName", label: "Short name" },
      { key: "title", label: "Title" },
      { key: "description", label: "Description" },
      { key: "accessUrl", label: "TAP URL" },
      { key: "ivoid", label: "IVOA identifier" },
      { key: "standardId", label: "Standard identifier" },
    ];
    const rows = parsed.structuredContent.data.map((service) => ({
      shortName: service.shortName ?? null,
      title: service.title,
      description: service.description ?? null,
      accessUrl: service.accessUrl,
      ivoid: service.ivoid,
      standardId: service.standardId,
    }));
    return finalizeStarfetchTableView({
      columns,
      resultKind: "registry-services",
      rows,
      source: {
        registryUrl: parsed.structuredContent.diagnostics.registryUrl,
        tool: parsed.sourceTool,
      },
      title: "TAP registry service matches",
    });
  }

  if (sourceTool === "starfetch_tap_tables") {
    const parsed = tablesResultSchema.parse(input);
    const columns: StarfetchTableViewV1["columns"] = [
      { key: "schema", label: "Schema" },
      { key: "name", label: "Table" },
      { key: "description", label: "Description" },
    ];
    const rows = parsed.structuredContent.data.map((table) => ({
      schema: table.schema ?? null,
      name: table.name,
      description: table.description ?? null,
    }));
    const target = parsed.structuredContent.diagnostics.target;
    return finalizeStarfetchTableView({
      columns,
      resultKind: "tables",
      rows,
      source: { target, tool: parsed.sourceTool },
      title: `${target.label ?? target.service ?? target.baseUrl} tables`,
    });
  }

  if (sourceTool === "starfetch_tap_columns") {
    const parsed = columnsResultSchema.parse(input);
    const columns: StarfetchTableViewV1["columns"] = [
      { key: "name", label: "Column" },
      { key: "datatype", label: "Datatype" },
      { key: "unit", label: "Unit" },
      { key: "ucd", label: "UCD" },
      { key: "description", label: "Description" },
    ];
    const rows = parsed.structuredContent.data.map((column) => ({
      name: column.name,
      datatype: column.datatype ?? null,
      unit: column.unit ?? null,
      ucd: column.ucd ?? null,
      description: column.description ?? null,
    }));
    const diagnostics = parsed.structuredContent.diagnostics;

    return finalizeStarfetchTableView({
      columns,
      resultKind: "columns",
      rows,
      source: {
        table: diagnostics.table,
        target: diagnostics.target,
        tool: parsed.sourceTool,
      },
      title: `${diagnostics.table} columns`,
    });
  }

  if (sourceTool === "starfetch_tap_query") {
    assertJsonPresentationFormat(input);
    const parsed = queryResultSchema.parse(input);
    const data = parsed.structuredContent.data;
    const rows = parseScientificRows(data.content);
    const columns = inferScientificColumns(rows);
    const diagnostics = parsed.structuredContent.diagnostics;

    return finalizeStarfetchTableView({
      columns,
      resultKind: "query-rows",
      rows: rectangularRows(rows, columns),
      source: {
        effectiveMaxrec: diagnostics.effectiveMaxrec,
        format: data.format,
        query: diagnostics.query,
        requestFormat: diagnostics.requestFormat,
        ...(diagnostics.runId === undefined
          ? {}
          : { runId: diagnostics.runId }),
        target: diagnostics.target,
        tool: parsed.sourceTool,
      },
      title: `${targetName(diagnostics.target)} query results`,
    });
  }

  if (sourceTool === "starfetch_tap_job_fetch") {
    assertJsonPresentationFormat(input);
    const parsed = jobFetchResultSchema.parse(input);
    const data = parsed.structuredContent.data;
    const rows = parseScientificRows(data.content);
    const columns = inferScientificColumns(rows);
    const diagnostics = parsed.structuredContent.diagnostics;

    return finalizeStarfetchTableView({
      columns,
      resultKind: "async-query-rows",
      rows: rectangularRows(rows, columns),
      source: {
        format: data.format,
        job: diagnostics.job,
        requestFormat: diagnostics.requestFormat,
        sourceFormat: diagnostics.sourceFormat,
        target: diagnostics.target,
        tool: parsed.sourceTool,
      },
      title: `${targetName(diagnostics.target)} async job results`,
    });
  }

  const parsed = presetResultSchema.parse(input);
  const columns: StarfetchTableViewV1["columns"] = [
    { key: "name", label: "Name" },
    { key: "label", label: "Label" },
    { key: "url", label: "TAP URL" },
    { key: "syncRequest", label: "Sync request" },
  ];
  const rows = parsed.structuredContent.data.map((preset) => ({
    name: preset.name,
    label: preset.label ?? null,
    url: preset.url,
    syncRequest: preset.syncRequest ?? null,
  }));
  return finalizeStarfetchTableView({
    columns,
    resultKind: "presets",
    rows,
    source: { tool: parsed.sourceTool },
    title: "Starfetch TAP service presets",
  });
}

function parseScientificRows(
  content: string,
): Array<Record<string, string | null>> {
  return scientificRowsSchema.parse(JSON.parse(content) as unknown);
}

function inferScientificColumns(
  rows: Array<Record<string, string | null>>,
): StarfetchTableViewV1["columns"] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      keys.add(key);
    }
  }

  return [...keys].map((key) => ({ key, label: key }));
}

function rectangularRows(
  rows: Array<Record<string, string | null>>,
  columns: StarfetchTableViewV1["columns"],
): Array<Record<string, string | null>> {
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => [column.key, row[column.key] ?? null]),
    ),
  );
}

function targetName(target: z.infer<typeof targetSchema>): string {
  return target.label ?? target.service ?? target.baseUrl;
}

function assertJsonPresentationFormat(input: unknown): void {
  const format = z
    .object({
      structuredContent: z.object({
        data: z.object({ format: z.string() }),
      }),
    })
    .parse(input).structuredContent.data.format;

  if (format !== "json") {
    throw new StarfetchPresentationError(
      "UNSUPPORTED_FORMAT",
      "Table presentation requires canonical JSON output.",
    );
  }
}
