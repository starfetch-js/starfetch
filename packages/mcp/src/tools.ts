import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  defaultRegistryUrl,
  defaultTapPresets,
  registry,
  tapRequestFormatForOutput,
  type QueryOptions,
  type TapOutputFormat,
  type TapRegistryOptions,
  type TapRegistrySearchOptions,
  type TapSyncFormat,
} from "@starfetch-js/core";
import { z } from "zod/v4";

import { registerJobTools } from "./job-tools.js";
import {
  availabilitySchema,
  capabilitiesSchema,
  columnsOutputSchema,
  columnsInputSchema,
  presetListOutputSchema,
  registrySearchInputSchema,
  registrySearchOutputSchema,
  tablesOutputSchema,
  targetDiagnosticsSchema,
  targetInputSchema,
  tapQueryInputSchema,
  tapQueryOutputSchema,
  type TapQueryInput,
} from "./schemas.js";
import { runTool, success, targetDiagnostics } from "./results.js";
import { createTapQueryData } from "./query-result.js";
import type { StarfetchMcpRuntimeOptions } from "./server.js";
import { createTapClient, createTapUploads } from "./tap-client.js";
import {
  readOnlyLocalAnnotations,
  readOnlyNetworkAnnotations,
} from "./tool-annotations.js";

const defaultTapQueryMaxrec = 100;

export function registerStarfetchTools(
  server: McpServer,
  options: StarfetchMcpRuntimeOptions,
): void {
  registerPresetTools(server);
  registerRegistryTools(server, options);
  registerMetadataTools(server, options);
  registerQueryTools(server, options);
  registerJobTools(server, options);
}

function registerPresetTools(server: McpServer): void {
  server.registerTool(
    "starfetch_list_presets",
    {
      annotations: readOnlyLocalAnnotations,
      description:
        "List built-in TAP service presets before selecting an explicit target for metadata inspection.",
      outputSchema: presetListOutputSchema,
      title: "List TAP presets",
    },
    () =>
      success(
        Object.values(defaultTapPresets).sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
        { count: Object.keys(defaultTapPresets).length },
      ),
  );
}

function registerRegistryTools(
  server: McpServer,
  options: StarfetchMcpRuntimeOptions,
): void {
  server.registerTool(
    "starfetch_registry_search",
    {
      annotations: readOnlyNetworkAnnotations,
      description:
        "Search VO registry metadata when no built-in preset fits; inspect the selected service before querying it.",
      inputSchema: registrySearchInputSchema,
      outputSchema: registrySearchOutputSchema,
      title: "Search TAP registry",
    },
    async ({ query, maxrec, registryUrl }, extra) =>
      runTool(async () => {
        const registryOptions: TapRegistryOptions = {};

        if (options.fetch !== undefined) {
          registryOptions.fetch = options.fetch;
        }

        if (registryUrl !== undefined) {
          registryOptions.registryUrl = registryUrl;
        }

        const searchOptions: TapRegistrySearchOptions = {};

        if (query !== undefined) {
          searchOptions.query = query;
        }

        const prepared = options.policy.prepareRegistry({
          fallbackMaxrec: defaultTapQueryMaxrec,
          incomingSignal: extra.signal,
          requestedMaxrec: maxrec,
        });
        if (prepared.maxrec !== undefined) {
          searchOptions.maxrec = prepared.maxrec;
        }
        searchOptions.signal = prepared.signal;

        const data =
          await registry(registryOptions).searchTapServices(searchOptions);

        return success(data, {
          count: data.length,
          registryUrl: registryUrl ?? defaultRegistryUrl,
        });
      }),
  );
}

function registerMetadataTools(
  server: McpServer,
  options: StarfetchMcpRuntimeOptions,
): void {
  server.registerTool(
    "starfetch_tap_availability",
    {
      annotations: readOnlyNetworkAnnotations,
      description:
        "Check whether the selected TAP service reports itself available; an unavailable service is not an empty catalog result.",
      inputSchema: targetInputSchema,
      outputSchema: z.object({
        data: availabilitySchema,
        diagnostics: targetDiagnosticsSchema,
      }),
      title: "Read TAP availability",
    },
    async (input, extra) =>
      runTool(async () => {
        const client = createTapClient(input, options);
        const data = await client.availability({
          signal: options.policy.signal(extra.signal),
        });

        return success(data, {
          target: targetDiagnostics(client.target),
        });
      }),
  );

  server.registerTool(
    "starfetch_tap_capabilities",
    {
      annotations: readOnlyNetworkAnnotations,
      description:
        "Inspect the selected TAP service's languages, formats, and authentication requirements before using service-specific features.",
      inputSchema: targetInputSchema,
      outputSchema: z.object({
        data: capabilitiesSchema,
        diagnostics: targetDiagnosticsSchema,
      }),
      title: "Read TAP capabilities",
    },
    async (input, extra) =>
      runTool(async () => {
        const client = createTapClient(input, options);
        const data = await client.capabilities({
          signal: options.policy.signal(extra.signal),
        });

        return success(data, {
          target: targetDiagnostics(client.target),
        });
      }),
  );

  server.registerTool(
    "starfetch_tap_tables",
    {
      annotations: readOnlyNetworkAnnotations,
      description:
        "List tables on the selected TAP service before choosing an exact table for ADQL.",
      inputSchema: targetInputSchema,
      outputSchema: tablesOutputSchema,
      title: "List TAP tables",
    },
    async (input, extra) =>
      runTool(async () => {
        const client = createTapClient(input, options);
        const data = await client.tables({
          signal: options.policy.signal(extra.signal),
        });

        return success(data, {
          count: data.length,
          target: targetDiagnostics(client.target),
        });
      }),
  );

  server.registerTool(
    "starfetch_tap_columns",
    {
      annotations: readOnlyNetworkAnnotations,
      description:
        "Inspect names, datatypes, units, and descriptions for an exact metadata-discovered table before constructing ADQL.",
      inputSchema: columnsInputSchema,
      outputSchema: columnsOutputSchema,
      title: "List TAP columns",
    },
    async (input, extra) =>
      runTool(async () => {
        const client = createTapClient(input, options);
        const data = await client.columns(input.table, {
          signal: options.policy.signal(extra.signal),
        });

        return success(data, {
          count: data.length,
          table: input.table,
          target: targetDiagnostics(client.target),
        });
      }),
  );
}

function registerQueryTools(
  server: McpServer,
  options: StarfetchMcpRuntimeOptions,
): void {
  server.registerTool(
    "starfetch_tap_query",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Run a small bounded synchronous TAP ADQL query after inspecting the exact table and columns. Use TOP in ADQL and/or maxrec, and treat tool errors as failures rather than empty scientific results.",
      inputSchema: tapQueryInputSchema,
      outputSchema: tapQueryOutputSchema,
      title: "Run bounded TAP query",
    },
    async (input, extra) =>
      runTool(async () => {
        const startedAt = performance.now();
        const client = createTapClient(input, options);
        const format = input.format;
        const requestFormat = tapRequestFormatForOutput(format);
        const prepared = options.policy.prepareQuery({
          fallbackMaxrec: defaultTapQueryMaxrec,
          incomingSignal: extra.signal,
          requestedMaxrec: input.maxrec,
          uploads: input.uploads,
        });
        const maxrec = prepared.maxrec;
        const result = await client.query(
          input.query,
          createTapQueryOptions(input, requestFormat, maxrec, prepared.signal),
        );
        const data = await createTapQueryData(result, format);

        const diagnostics: {
          durationMs: number;
          effectiveMaxrec: number;
          format: TapOutputFormat;
          requestFormat: TapSyncFormat;
          query: string;
          runId?: string;
          target: ReturnType<typeof targetDiagnostics>;
          uploadCount: number;
        } = {
          durationMs: performance.now() - startedAt,
          effectiveMaxrec: maxrec,
          format,
          requestFormat,
          query: input.query,
          target: targetDiagnostics(client.target),
          uploadCount: input.uploads?.length ?? 0,
        };

        if (input.runId !== undefined) {
          diagnostics.runId = input.runId;
        }

        return success(data, diagnostics);
      }),
  );
}

function createTapQueryOptions(
  input: TapQueryInput,
  format: TapSyncFormat,
  maxrec: number,
  signal: AbortSignal,
): QueryOptions {
  const queryOptions: QueryOptions = { format, maxrec, signal };

  if (input.runId !== undefined) {
    queryOptions.runId = input.runId;
  }

  const uploads = createTapUploads(input.uploads);

  if (uploads !== undefined) {
    queryOptions.uploads = uploads;
  }

  return queryOptions;
}
