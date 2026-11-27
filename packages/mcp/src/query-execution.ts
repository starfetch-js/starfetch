import { tapRequestFormatForOutput } from "@starfetch-js/core";

import { prepareTapQueryOptions } from "./query-options.js";
import { createTapQueryData } from "./query-result.js";
import {
  runTool,
  success,
  targetDiagnostics,
  type ToolResult,
} from "./results.js";
import type { TapQueryInput, TapQueryOutput } from "./schemas.js";
import type { StarfetchMcpRuntimeOptions } from "./server.js";
import { createTapClient } from "./tap-client.js";

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
    const prepared = await prepareTapQueryOptions(
      input,
      requestFormat,
      fallbackMaxrec,
      incomingSignal,
      options,
    );
    const result = await client.query(input.query, prepared);
    const data = await createTapQueryData(result, format);

    const diagnostics: TapQueryOutput["diagnostics"] = {
      durationMs: performance.now() - startedAt,
      effectiveMaxrec: prepared.maxrec,
      format,
      requestFormat,
      query: input.query,
      target: targetDiagnostics(client.target),
      uploadCount: prepared.uploads?.length ?? 0,
      ...(input.runId === undefined ? {} : { runId: input.runId }),
    };

    return success(data, diagnostics);
  });
}
