import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  defaultRegistryUrl,
  defaultTapPresets,
  registry,
  type TapRegistryOptions,
  type TapRegistrySearchOptions,
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
} from "./schemas.js";
import {
  DEFAULT_TAP_QUERY_MAXREC,
  executeStarfetchTapQuery,
} from "./query-execution.js";
import { runTool, success, targetDiagnostics } from "./results.js";
import { type StarfetchMcpRuntimeOptions } from "./server.js";
import { createTapClient } from "./tap-client.js";
import {
  readOnlyLocalAnnotations,
  readOnlyNetworkAnnotations,
} from "./tool-annotations.js";

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
          fallbackMaxrec: DEFAULT_TAP_QUERY_MAXREC,
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
    (input, extra) =>
      executeStarfetchTapQuery(
        input,
        extra.signal,
        options,
        DEFAULT_TAP_QUERY_MAXREC,
      ),
  );
}
