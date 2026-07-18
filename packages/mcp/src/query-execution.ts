import {
  tapRequestFormatForOutput,
  type QueryOptions,
  type TapSyncFormat,
} from "@starfetch-js/core";

import { createTapQueryData } from "./query-result.js";
import {
  runTool,
  success,
  targetDiagnostics,
  type ToolResult,
} from "./results.js";
import type { TapQueryInput, TapQueryOutput } from "./schemas.js";
import type { StarfetchMcpRuntimeOptions } from "./server.js";
import { createTapClient, createTapUploads } from "./tap-client.js";

export const DEFAULT_TAP_QUERY_MAXREC = 100;

export function executeStarfetchTapQuery(
  input: TapQueryInput,
  incomingSignal: AbortSignal,
  options: StarfetchMcpRuntimeOptions,
  fallbackMaxrec = DEFAULT_TAP_QUERY_MAXREC,
): Promise<ToolResult<TapQueryOutput>> {
  return runTool(async () => {
    const startedAt = performance.now();
    const client = createTapClient(input, options);
    const format = input.format;
    const requestFormat = tapRequestFormatForOutput(format);
    const prepared = options.policy.prepareQuery({
      fallbackMaxrec,
      incomingSignal,
      requestedMaxrec: input.maxrec,
      uploads: input.uploads,
    });
    const maxrec = prepared.maxrec;
    const result = await client.query(
      input.query,
      createTapQueryOptions(input, requestFormat, maxrec, prepared.signal),
    );
    const data = await createTapQueryData(result, format);

    const diagnostics: TapQueryOutput["diagnostics"] = {
      durationMs: performance.now() - startedAt,
      effectiveMaxrec: maxrec,
      format,
      requestFormat,
      query: input.query,
      target: targetDiagnostics(client.target),
      uploadCount: input.uploads?.length ?? 0,
      ...(input.runId === undefined ? {} : { runId: input.runId }),
    };

    return success(data, diagnostics);
  });
}

function createTapQueryOptions(
  input: TapQueryInput,
  format: TapSyncFormat,
  maxrec: number,
  signal: AbortSignal,
): QueryOptions {
  const queryOptions: QueryOptions = { format, maxrec, signal };

  if (input.runId !== undefined) queryOptions.runId = input.runId;
  const uploads = createTapUploads(input.uploads);
  if (uploads !== undefined) queryOptions.uploads = uploads;

  return queryOptions;
}
