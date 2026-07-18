import {
  parseStarfetchTablePresentationSource,
  type StarfetchTablePresentationSource,
} from "@starfetch-js/mcp";
import { z } from "zod/v4";

import {
  finalizeStarfetchTableView,
  finalizeStarfetchWidgetTableDataset,
} from "./presentation-bounds.js";
import {
  StarfetchPresentationError,
  type StarfetchTableViewDraft,
  type StarfetchTableViewV1,
  type StarfetchWidgetTableDatasetV1,
} from "./presentation-contract.js";

export {
  STARFETCH_TABLE_VIEW_LIMITS_V1,
  STARFETCH_WIDGET_TABLE_LIMITS_V1,
  StarfetchPresentationError,
  starfetchTableViewV1Schema,
  starfetchWidgetTableDatasetV1Schema,
  type StarfetchPresentationErrorCode,
  type StarfetchTableViewV1,
  type StarfetchWidgetTableDatasetV1,
} from "./presentation-contract.js";

type CanonicalScientificResult = Extract<
  StarfetchTablePresentationSource,
  {
    sourceTool: "starfetch_tap_job_fetch" | "starfetch_tap_query";
  }
>;

type CanonicalScientificData =
  CanonicalScientificResult["structuredContent"]["data"];

type StructuredScientificData = Extract<
  CanonicalScientificData,
  { format: "json" | "jsonl" }
>;

type JsonScientificData = Omit<StructuredScientificData, "format"> & {
  format: "json";
};

type CanonicalResultField = StructuredScientificData["fields"][number];

const scientificRowsSchema = z.array(
  z.record(z.string(), z.union([z.string(), z.null()])),
);

export function createStarfetchTableView(input: unknown): StarfetchTableViewV1 {
  return finalizeStarfetchTableView(createStarfetchTableDraft(input));
}

export function createStarfetchWidgetTableDataset(
  input: unknown,
): StarfetchWidgetTableDatasetV1 {
  return finalizeStarfetchWidgetTableDataset(createStarfetchTableDraft(input));
}

function createStarfetchTableDraft(input: unknown): StarfetchTableViewDraft {
  try {
    return createStarfetchTableDraftUnchecked(input);
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

function createStarfetchTableDraftUnchecked(
  input: unknown,
): StarfetchTableViewDraft {
  const result = parseStarfetchTablePresentationSource(input);

  switch (result.sourceTool) {
    case "starfetch_list_presets": {
      const columns: StarfetchTableViewV1["columns"] = [
        { key: "name", label: "Name" },
        { key: "label", label: "Label" },
        { key: "url", label: "TAP URL" },
        { key: "syncRequest", label: "Sync request" },
      ];
      const rows = result.structuredContent.data.map((preset) => ({
        name: preset.name,
        label: preset.label ?? null,
        url: preset.url,
        syncRequest: preset.syncRequest ?? null,
      }));

      return {
        columns,
        resultKind: "presets",
        rows,
        source: { tool: result.sourceTool },
        title: "Starfetch TAP service presets",
      };
    }

    case "starfetch_registry_search": {
      const columns: StarfetchTableViewV1["columns"] = [
        { key: "shortName", label: "Short name" },
        { key: "title", label: "Title" },
        { key: "description", label: "Description" },
        { key: "accessUrl", label: "TAP URL" },
        { key: "ivoid", label: "IVOA identifier" },
        { key: "standardId", label: "Standard identifier" },
      ];
      const rows = result.structuredContent.data.map((service) => ({
        shortName: service.shortName ?? null,
        title: service.title,
        description: service.description ?? null,
        accessUrl: service.accessUrl,
        ivoid: service.ivoid,
        standardId: service.standardId,
      }));

      return {
        columns,
        resultKind: "registry-services",
        rows,
        source: {
          registryUrl: result.structuredContent.diagnostics.registryUrl,
          tool: result.sourceTool,
        },
        title: "TAP registry service matches",
      };
    }

    case "starfetch_tap_tables": {
      const columns: StarfetchTableViewV1["columns"] = [
        { key: "schema", label: "Schema" },
        { key: "name", label: "Table" },
        { key: "description", label: "Description" },
      ];
      const rows = result.structuredContent.data.map((table) => ({
        schema: table.schema ?? null,
        name: table.name,
        description: table.description ?? null,
      }));
      const target = result.structuredContent.diagnostics.target;

      return {
        columns,
        resultKind: "tables",
        rows,
        source: { target, tool: result.sourceTool },
        title: `${targetName(target)} tables`,
      };
    }

    case "starfetch_tap_columns": {
      const columns: StarfetchTableViewV1["columns"] = [
        { key: "name", label: "Column" },
        { key: "datatype", label: "Datatype" },
        { key: "unit", label: "Unit" },
        { key: "ucd", label: "UCD" },
        { key: "description", label: "Description" },
      ];
      const rows = result.structuredContent.data.map((column) => ({
        name: column.name,
        datatype: column.datatype ?? null,
        unit: column.unit ?? null,
        ucd: column.ucd ?? null,
        description: column.description ?? null,
      }));
      const diagnostics = result.structuredContent.diagnostics;

      return {
        columns,
        resultKind: "columns",
        rows,
        source: {
          table: diagnostics.table,
          target: diagnostics.target,
          tool: result.sourceTool,
        },
        title: `${diagnostics.table} columns`,
      };
    }

    case "starfetch_tap_query": {
      const { data, diagnostics } = result.structuredContent;
      assertJsonPresentationData(data);
      const rows = parseScientificRows(data.content);
      assertScientificRowsMatchFields(rows, data.fields);

      return {
        columns: scientificColumns(data.fields),
        resultKind: "query-rows",
        rows,
        source: {
          durationMs: diagnostics.durationMs,
          effectiveMaxrec: diagnostics.effectiveMaxrec,
          format: data.format,
          ...(data.overflow === undefined ? {} : { overflow: data.overflow }),
          query: diagnostics.query,
          requestFormat: diagnostics.requestFormat,
          ...(diagnostics.runId === undefined
            ? {}
            : { runId: diagnostics.runId }),
          target: diagnostics.target,
          tool: result.sourceTool,
        },
        title: `${targetName(diagnostics.target)} query results`,
      };
    }

    case "starfetch_tap_job_fetch": {
      const { data, diagnostics } = result.structuredContent;
      assertJsonPresentationData(data);
      const rows = parseScientificRows(data.content);
      assertScientificRowsMatchFields(rows, data.fields);

      return {
        columns: scientificColumns(data.fields),
        resultKind: "async-query-rows",
        rows,
        source: {
          durationMs: diagnostics.durationMs,
          format: data.format,
          job: diagnostics.job,
          requestFormat: diagnostics.requestFormat,
          sourceFormat: diagnostics.sourceFormat,
          ...(data.overflow === undefined ? {} : { overflow: data.overflow }),
          target: diagnostics.target,
          tool: result.sourceTool,
        },
        title: `${targetName(diagnostics.target)} async job results`,
      };
    }
  }

  const exhaustive: never = result;
  return exhaustive;
}

function assertJsonPresentationData(
  data: CanonicalScientificData,
): asserts data is JsonScientificData {
  if (data.format !== "json") {
    throw new StarfetchPresentationError(
      "UNSUPPORTED_FORMAT",
      "Table presentation requires canonical JSON output.",
    );
  }
}

function parseScientificRows(
  content: string,
): Array<Record<string, string | null>> {
  return scientificRowsSchema.parse(JSON.parse(content) as unknown);
}

function scientificColumns(
  fields: CanonicalResultField[],
): StarfetchTableViewV1["columns"] {
  return fields.map(({ name, ...metadata }) => ({
    ...metadata,
    key: name,
    label: name,
  }));
}

function assertScientificRowsMatchFields(
  rows: Array<Record<string, string | null>>,
  fields: CanonicalResultField[],
): void {
  const fieldNames = fields.map((field) => field.name);
  const expected = new Set(fieldNames);
  const invalid =
    expected.size !== fieldNames.length ||
    rows.some((row) => {
      const keys = Object.keys(row);
      return (
        keys.length !== fieldNames.length ||
        keys.some((key) => !expected.has(key))
      );
    });

  if (invalid) {
    throw new StarfetchPresentationError(
      "INVALID_SOURCE",
      "Canonical scientific rows must exactly match ordered result fields.",
    );
  }
}

function targetName(target: {
  baseUrl: string;
  label?: string | undefined;
  service?: string | undefined;
}): string {
  return target.label ?? target.service ?? target.baseUrl;
}
