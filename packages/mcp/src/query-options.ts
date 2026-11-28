import {
  TapUploadError,
  prepareTargetList,
  type QueryOptions,
  type TapSyncFormat,
} from "@starfetch-js/core";

import type { TapQueryInput } from "./schemas.js";
import type { StarfetchMcpRuntimeOptions } from "./server.js";
import { createTapJobClient, createTapUploads } from "./tap-client.js";

export async function prepareTapQueryOptions(
  input: Pick<
    TapQueryInput,
    "maxrec" | "runId" | "uploads" | "uploadFromJob" | "targetList"
  >,
  format: TapSyncFormat | undefined,
  fallbackMaxrec: number,
  incomingSignal: AbortSignal,
  options: StarfetchMcpRuntimeOptions,
): Promise<QueryOptions & { maxrec: number }> {
  let uploads = input.uploads;
  if (input.targetList) {
    if (
      [...(uploads ?? []), input.uploadFromJob].some(
        (upload) => upload?.tableName.toLowerCase() === "targets",
      )
    ) {
      throw new TapUploadError(
        "The CSV target list already uses TAP_UPLOAD.targets.",
      );
    }
    const { votable, rowCount } = prepareTargetList(
      input.targetList.csv,
      input.targetList.idType,
    );
    fallbackMaxrec = Math.max(fallbackMaxrec, rowCount);
    uploads = [...(uploads ?? []), { tableName: "targets", votable }];
  }
  let signal = incomingSignal;
  const source = input.uploadFromJob;
  if (source !== undefined) {
    signal = options.policy.signal(incomingSignal);
    const votable = await readJobVotable(source, signal, options);
    uploads = [...(uploads ?? []), { tableName: source.tableName, votable }];
  }
  const prepared = options.policy.prepareQuery({
    fallbackMaxrec,
    incomingSignal: signal,
    requestedMaxrec: input.maxrec,
    uploads,
  });
  const queryOptions: QueryOptions & { maxrec: number } = { ...prepared };
  if (format !== undefined) queryOptions.format = format;
  if (input.runId !== undefined) queryOptions.runId = input.runId;
  const tapUploads = createTapUploads(uploads);
  if (tapUploads !== undefined) queryOptions.uploads = tapUploads;
  return queryOptions;
}

async function readJobVotable(
  source: NonNullable<TapQueryInput["uploadFromJob"]>,
  signal: AbortSignal,
  options: StarfetchMcpRuntimeOptions,
): Promise<string> {
  const client = createTapJobClient({ jobIdOrUrl: source.jobUrl }, options);
  const job = client.jobs.from(source.jobUrl);
  options.policy.authorizeJob(
    "jobCapability" in source ? source.jobCapability : undefined,
    job.url,
    "fetch",
  );
  const status = await job.status({ signal });
  if (status.phase !== "COMPLETED") {
    throw new TapUploadError(
      `Source job must be COMPLETED before upload (phase: ${status.phase}).`,
    );
  }
  const result = await job.fetch({ format: "votable", signal });
  if (result.format !== "votable") {
    throw new TapUploadError(
      "Submit the source job with requestFormat=votable.",
    );
  }
  if (await result.overflow()) {
    throw new TapUploadError(
      "Source job reported OVERFLOW. Refine the source query or increase its MAXREC before upload.",
    );
  }
  // Require a locally readable table before forwarding the original XML.
  await result.fields();
  return result.text();
}
