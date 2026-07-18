import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  tapRequestFormatForOutput,
  type QueryOptions,
  type TapJobWaitOptions,
  type TapSyncFormat,
} from "@starfetch-js/core";
import { z } from "zod/v4";

import {
  hostedTapJobFetchInputSchema,
  hostedTapJobInputSchema,
  hostedTapJobSubmitDataSchema,
  hostedTapJobWaitInputSchema,
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
  type HostedTapJobInput,
  type TapJobInput,
  type TapJobSubmitInput,
  type TapJobWaitInput,
} from "./schemas.js";
import { runTool, success, targetDiagnostics } from "./results.js";
import { createTapQueryData } from "./query-result.js";
import type { StarfetchMcpRuntimeOptions } from "./server.js";
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
const jobToolSurfaces = {
  capability: {
    deleteDescription:
      "Delete a TAP async job from the remote service using its hosted jobCapability.",
    fetchDescription:
      "Fetch a TAP async job result, passing the hosted jobCapability. JSON and JSONL conversion supports VOTable, CSV, and TSV rows.",
    submitDescription:
      "Submit metadata-backed bounded ADQL as an explicit TAP async job when synchronous querying is insufficient. Preserve the exact query and returned jobCapability; use starfetch_tap_query for small work.",
    statusDescription:
      "Read the current phase and links for a TAP async job. Pass the jobCapability returned by hosted submission.",
    waitDescription:
      "Poll a TAP async job until completion, timeout, or terminal failure. Pass the hosted jobCapability. This is an explicit wait and never starts a background job.",
  },
  unrestricted: {
    deleteDescription: "Delete a TAP async job from the remote service.",
    fetchDescription:
      "Fetch a TAP async job result. JSON and JSONL conversion supports VOTable, CSV, and TSV rows.",
    submitDescription:
      "Submit metadata-backed bounded ADQL as an explicit TAP async job when synchronous querying is insufficient. Preserve the exact query and use starfetch_tap_query for small work.",
    statusDescription: "Read the current phase and links for a TAP async job.",
    waitDescription:
      "Poll a TAP async job until completion, timeout, or terminal failure. This is an explicit wait and never starts a background job.",
  },
} as const;

export function registerJobTools(
  server: McpServer,
  options: StarfetchMcpRuntimeOptions,
): void {
  const surface = jobToolSurfaces[options.policy.jobAccess];
  server.registerTool(
    "starfetch_tap_submit_job",
    {
      annotations: writeNetworkAnnotations,
      description: surface.submitDescription,
      inputSchema: tapJobSubmitInputSchema,
      outputSchema: z.object({
        data:
          options.policy.jobAccess === "capability"
            ? hostedTapJobSubmitDataSchema
            : tapJobDataSchema,
        diagnostics: tapJobSubmitDiagnosticsSchema,
      }),
      title: "Submit TAP async job",
    },
    async (input, extra) =>
      runTool(async () => {
        const client = createTapClient(input, options);
        const prepared = options.policy.prepareQuery({
          fallbackMaxrec: defaultTapJobSubmitMaxrec,
          incomingSignal: extra.signal,
          requestedMaxrec: input.maxrec,
          uploads: input.uploads,
        });
        const maxrec = prepared.maxrec;
        const job = await client.jobs.submit(
          input.query,
          createTapJobSubmitOptions(input, maxrec, prepared.signal),
        );
        const jobCapability = options.policy.issueJobCapability(job.url);
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

        return success(jobData(job, jobCapability), diagnostics);
      }),
  );

  server.registerTool(
    "starfetch_tap_job_status",
    {
      annotations: readOnlyNetworkAnnotations,
      description: surface.statusDescription,
      inputSchema:
        options.policy.jobAccess === "capability"
          ? hostedTapJobInputSchema
          : tapJobInputSchema,
      outputSchema: z.object({
        data: tapJobStatusSchema,
        diagnostics: tapJobDiagnosticsSchema,
      }),
      title: "Read TAP async job status",
    },
    async (input, extra) =>
      runTool(async () => {
        const { client, job } = createJobHandle(input, options);
        options.policy.authorizeJob(
          readJobCapability(input),
          job.url,
          "status",
        );
        const status = await job.status({
          signal: options.policy.signal(extra.signal),
        });

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
      description: surface.waitDescription,
      inputSchema:
        options.policy.jobAccess === "capability"
          ? hostedTapJobWaitInputSchema
          : tapJobWaitInputSchema,
      outputSchema: z.object({
        data: tapJobStatusSchema,
        diagnostics: tapJobWaitDiagnosticsSchema,
      }),
      title: "Wait for TAP async job",
    },
    async (input, extra) =>
      runTool(async () => {
        const { client, job } = createJobHandle(input, options);
        options.policy.authorizeJob(readJobCapability(input), job.url, "wait");
        const observedPhases: string[] = [];
        const wait = options.policy.prepareWait(
          input,
          defaultTapJobWaitTimeoutMs,
          extra.signal,
        );
        const timeoutMs = wait.timeoutMs;
        const status = await job.wait(
          createTapJobWaitOptions(input, wait, wait.signal, (phase) => {
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
      description: surface.fetchDescription,
      inputSchema:
        options.policy.jobAccess === "capability"
          ? hostedTapJobFetchInputSchema
          : tapJobFetchInputSchema,
      outputSchema: tapJobFetchOutputSchema,
      title: "Fetch TAP async job result",
    },
    async (input, extra) =>
      runTool(async () => {
        const startedAt = performance.now();
        const { client, job } = createJobHandle(input, options);
        options.policy.authorizeJob(readJobCapability(input), job.url, "fetch");
        const format = input.format;
        const requestFormat = tapRequestFormatForOutput(format);
        const result = await job.fetch({
          format: input.sourceFormat ?? requestFormat,
          signal: options.policy.signal(extra.signal),
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
      description: surface.deleteDescription,
      inputSchema:
        options.policy.jobAccess === "capability"
          ? hostedTapJobInputSchema
          : tapJobInputSchema,
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
    async (input, extra) =>
      runTool(async () => {
        const { client, job } = createJobHandle(input, options);
        options.policy.authorizeJob(
          readJobCapability(input),
          job.url,
          "delete",
        );
        const data = {
          deleted: true as const,
          ...jobData(job),
        };

        await job.delete({
          signal: options.policy.signal(extra.signal),
        });

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
  signal: AbortSignal,
): QueryOptions {
  const queryOptions: QueryOptions = { maxrec, signal };

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
  options: StarfetchMcpRuntimeOptions,
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
  wait: { intervalMs?: number; maxIntervalMs?: number; timeoutMs: number },
  signal: AbortSignal,
  onProgress: (phase: string) => void,
): TapJobWaitOptions {
  const options: TapJobWaitOptions = {
    onProgress: (status) => {
      onProgress(status.phase);
    },
    signal,
    timeoutMs: wait.timeoutMs,
  };

  if (wait.intervalMs !== undefined) {
    options.intervalMs = wait.intervalMs;
  }

  if (input.backoff === true) {
    options.backoff = true;
  }

  if (wait.maxIntervalMs !== undefined) {
    options.maxIntervalMs = wait.maxIntervalMs;
  }

  return options;
}

function jobData(
  job: { id: string; url: string },
  jobCapability?: string,
): {
  id: string;
  jobCapability?: string;
  url: string;
} {
  return {
    id: job.id,
    ...(jobCapability === undefined ? {} : { jobCapability }),
    url: job.url,
  };
}

function readJobCapability(
  input: TapJobInput | HostedTapJobInput,
): string | undefined {
  return "jobCapability" in input ? input.jobCapability : undefined;
}
