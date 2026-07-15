import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  tapRequestFormatForOutput,
  type QueryOptions,
  type TapJobWaitOptions,
  type TapSyncFormat,
} from "@starfetch-js/core";
import { z } from "zod/v4";

import {
  tapJobDataSchema,
  tapJobDiagnosticsSchema,
  tapJobFetchInputSchema,
  tapJobFetchOutputSchema,
  tapJobInputSchema,
  tapJobStatusSchema,
  tapJobSubmitDiagnosticsSchema,
  tapJobSubmitInputSchema,
  tapJobWaitDiagnosticsSchema,
  tapJobWaitInputSchema,
  type TapJobInput,
  type TapJobSubmitInput,
  type TapJobWaitInput,
} from "./schemas.js";
import { runTool, success, targetDiagnostics } from "./results.js";
import { createTapQueryData } from "./query-result.js";
import type { StarfetchMcpServerOptions } from "./server.js";
import {
  createTapClient,
  createTapJobClient,
  createTapUploads,
} from "./tap-client.js";
import {
  destructiveNetworkAnnotations,
  readOnlyNetworkAnnotations,
  writeNetworkAnnotations,
} from "./tool-annotations.js";

const defaultTapJobWaitTimeoutMs = 120000;
const defaultTapJobSubmitMaxrec = 100;

export function registerJobTools(
  server: McpServer,
  options: StarfetchMcpServerOptions,
): void {
  server.registerTool(
    "starfetch_tap_submit_job",
    {
      annotations: writeNetworkAnnotations,
      description:
        "Submit metadata-backed bounded ADQL as an explicit TAP async job when synchronous querying is insufficient. Preserve the exact query and use starfetch_tap_query for small work.",
      inputSchema: tapJobSubmitInputSchema,
      outputSchema: z.object({
        data: tapJobDataSchema,
        diagnostics: tapJobSubmitDiagnosticsSchema,
      }),
      title: "Submit TAP async job",
    },
    async (input) =>
      runTool(async () => {
        const client = createTapClient(input, options);
        const maxrec = input.maxrec ?? defaultTapJobSubmitMaxrec;
        const job = await client.jobs.submit(
          input.query,
          createTapJobSubmitOptions(input, maxrec),
        );
        const diagnostics: {
          effectiveMaxrec: number;
          requestFormat?: TapSyncFormat;
          query: string;
          runId?: string;
          target: ReturnType<typeof targetDiagnostics>;
          uploadCount: number;
        } = {
          effectiveMaxrec: maxrec,
          query: input.query,
          target: targetDiagnostics(client.target),
          uploadCount: input.uploads?.length ?? 0,
        };

        if (input.requestFormat !== undefined) {
          diagnostics.requestFormat = input.requestFormat;
        }

        if (input.runId !== undefined) {
          diagnostics.runId = input.runId;
        }

        return success(jobData(job), diagnostics);
      }),
  );

  server.registerTool(
    "starfetch_tap_job_status",
    {
      annotations: readOnlyNetworkAnnotations,
      description: "Read the current phase and links for a TAP async job.",
      inputSchema: tapJobInputSchema,
      outputSchema: z.object({
        data: tapJobStatusSchema,
        diagnostics: tapJobDiagnosticsSchema,
      }),
      title: "Read TAP async job status",
    },
    async (input) =>
      runTool(async () => {
        const { client, job } = createJobHandle(input, options);
        const status = await job.status();

        return success(status, {
          job: jobData(job),
          target: targetDiagnostics(client.target),
        });
      }),
  );

  server.registerTool(
    "starfetch_tap_job_wait",
    {
      annotations: readOnlyNetworkAnnotations,
      description:
        "Poll a TAP async job until completion, timeout, or terminal failure. This is an explicit wait and never starts a background job.",
      inputSchema: tapJobWaitInputSchema,
      outputSchema: z.object({
        data: tapJobStatusSchema,
        diagnostics: tapJobWaitDiagnosticsSchema,
      }),
      title: "Wait for TAP async job",
    },
    async (input) =>
      runTool(async () => {
        const { client, job } = createJobHandle(input, options);
        const observedPhases: string[] = [];
        const timeoutMs = input.timeoutMs ?? defaultTapJobWaitTimeoutMs;
        const status = await job.wait(
          createTapJobWaitOptions(input, timeoutMs, (phase) => {
            observedPhases.push(phase);
          }),
        );

        return success(status, {
          job: jobData(job),
          observedPhases,
          target: targetDiagnostics(client.target),
          timeoutMs,
        });
      }),
  );

  server.registerTool(
    "starfetch_tap_job_fetch",
    {
      annotations: readOnlyNetworkAnnotations,
      description:
        "Fetch a TAP async job result. JSON and JSONL conversion supports VOTable, CSV, and TSV rows.",
      inputSchema: tapJobFetchInputSchema,
      outputSchema: tapJobFetchOutputSchema,
      title: "Fetch TAP async job result",
    },
    async (input) =>
      runTool(async () => {
        const startedAt = performance.now();
        const { client, job } = createJobHandle(input, options);
        const format = input.format;
        const requestFormat = tapRequestFormatForOutput(format);
        const result = await job.fetch({
          format: input.sourceFormat ?? requestFormat,
        });
        const data = await createTapQueryData(result, format);

        return success(data, {
          durationMs: performance.now() - startedAt,
          format,
          job: jobData(job),
          requestFormat,
          sourceFormat: result.format,
          target: targetDiagnostics(client.target),
        });
      }),
  );

  server.registerTool(
    "starfetch_tap_job_delete",
    {
      annotations: destructiveNetworkAnnotations,
      description: "Delete a TAP async job from the remote service.",
      inputSchema: tapJobInputSchema,
      outputSchema: z.object({
        data: z.object({
          deleted: z.literal(true),
          id: z.string(),
          url: z.string(),
        }),
        diagnostics: tapJobDiagnosticsSchema,
      }),
      title: "Delete TAP async job",
    },
    async (input) =>
      runTool(async () => {
        const { client, job } = createJobHandle(input, options);
        const data = {
          deleted: true as const,
          ...jobData(job),
        };

        await job.delete();

        return success(data, {
          job: jobData(job),
          target: targetDiagnostics(client.target),
        });
      }),
  );
}

function createTapJobSubmitOptions(
  input: TapJobSubmitInput,
  maxrec: number,
): QueryOptions {
  const queryOptions: QueryOptions = { maxrec };

  if (input.requestFormat !== undefined) {
    queryOptions.format = input.requestFormat;
  }

  if (input.runId !== undefined) {
    queryOptions.runId = input.runId;
  }

  const uploads = createTapUploads(input.uploads);

  if (uploads !== undefined) {
    queryOptions.uploads = uploads;
  }

  return queryOptions;
}

function createJobHandle(
  input: TapJobInput,
  options: StarfetchMcpServerOptions,
): {
  client: ReturnType<typeof createTapJobClient>;
  job: ReturnType<ReturnType<typeof createTapJobClient>["jobs"]["from"]>;
} {
  const client = createTapJobClient(input, options);
  const job = client.jobs.from(input.jobIdOrUrl);

  return { client, job };
}

function createTapJobWaitOptions(
  input: TapJobWaitInput,
  timeoutMs: number,
  onProgress: (phase: string) => void,
): TapJobWaitOptions {
  const options: TapJobWaitOptions = {
    onProgress: (status) => {
      onProgress(status.phase);
    },
    timeoutMs,
  };

  if (input.intervalMs !== undefined) {
    options.intervalMs = input.intervalMs;
  }

  if (input.backoff === true) {
    options.backoff = true;
  }

  if (input.maxIntervalMs !== undefined) {
    options.maxIntervalMs = input.maxIntervalMs;
  }

  return options;
}

function jobData(job: { id: string; url: string }): {
  id: string;
  url: string;
} {
  return {
    id: job.id,
    url: job.url,
  };
}
