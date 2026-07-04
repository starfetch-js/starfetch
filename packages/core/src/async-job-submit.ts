import { TapHttpError } from "./errors.js";
import { waitForTapJob, type TapJobWaitOptions } from "./async-job-wait.js";
import { buildTapQueryBody, createTapQueryParamOptions } from "./tap-params.js";
import {
  tapDeleteUrl,
  tapGetUrl,
  tapPostForm,
  type TapHttpRequestOptions,
} from "./tap-http.js";
import type { ResolvedTapTarget } from "./target-resolver.js";
import { assertSupportedSyncFormat, type QueryOptions } from "./sync-query.js";
import {
  createTapResultFromResponse,
  type TapResult,
} from "./tap-result-output.js";
import { parseUwsJobStatus, type TapJobStatus } from "./uws-job-status.js";
import { assertAnonymousTapSupported } from "./vosi-metadata.js";

export type { TapJobStatus } from "./uws-job-status.js";
export type { TapJobWaitOptions } from "./async-job-wait.js";

/** Parsed reference to an existing TAP async job. */
export type TapJobReference =
  | {
      kind: "absolute-url";
      baseUrl: string;
      id: string;
      url: string;
    }
  | {
      kind: "bare-id";
      id: string;
    };

/** Handle for an individual TAP UWS async job. */
export type TapJob = {
  /** UWS job identifier. */
  id: string;
  /** Absolute UWS job URL. */
  url: string;
  /** Read the current UWS job phase and result/error links. */
  status(): Promise<TapJobStatus>;
  /** Poll until the job completes or a wait condition fails. */
  wait(options?: TapJobWaitOptions): Promise<TapJobStatus>;
  /** Fetch the primary TAP result from the completed job. */
  fetch(options?: TapJobFetchOptions): Promise<TapResult>;
  /** Request job cleanup through the UWS job URL. */
  delete(): Promise<void>;
};

/** Async TAP job operations bound to a TAP client target. */
export type TapJobsClient = {
  /**
   * Submit ADQL to TAP `/async`, start the job, and return its handle.
   *
   * @param adql - ADQL query text sent as TAP `QUERY`.
   * @param options - TAP request options such as `format`, `maxrec`, `runId`,
   *   `uploads`, and `signal`.
   */
  submit(adql: string, options?: QueryOptions): Promise<TapJob>;
  /**
   * Create a handle for an existing job without contacting the service.
   *
   * Bare job IDs are resolved against the client's `/async` URL. Absolute job
   * URLs are used as-is.
   */
  from(jobIdOrUrl: string): TapJob;
};

/** Options accepted when fetching a TAP async job result. */
export type TapJobFetchOptions = Pick<QueryOptions, "format" | "signal">;

type SubmitTapAsyncJobOptions = QueryOptions & {
  fetch?: typeof fetch;
  userAgent?: string;
};

type TapJobOptions = TapJobFetchOptions & {
  fetch?: typeof fetch;
  userAgent?: string;
};

/**
 * Submit an ADQL query to TAP `/async`, start the UWS job, and return a handle.
 */
export async function submitTapAsyncJob(
  target: ResolvedTapTarget,
  adql: string,
  options: SubmitTapAsyncJobOptions = {},
): Promise<TapJob> {
  const format = options.format;

  if (format !== undefined) {
    assertSupportedSyncFormat(format);
  }

  const body = buildTapQueryBody(
    adql,
    createTapQueryParamOptions(options, format),
  );
  await assertAnonymousTapSupported(target, options);
  const submitOptions = createAsyncHttpOptions(options);
  const asyncUrl = `${target.baseUrl.replace(/\/+$/, "")}/async/`;
  const response = await tapPostForm(
    target.baseUrl,
    "async",
    body,
    submitOptions,
  );
  const jobUrl = response.headers.get("location");

  if (jobUrl === null || jobUrl.trim() === "") {
    throw new TapHttpError("TAP async job creation did not return a job URL");
  }

  const job = createTapJob(jobUrl, asyncUrl, options);
  const startOptions = createAsyncHttpOptions(options);

  await tapPostForm(
    job.url,
    "phase",
    new URLSearchParams({ PHASE: "RUN" }),
    startOptions,
  );

  return job;
}

/** Parse the job reference accepted by TAP async job commands and adapters. */
export function parseTapJobReference(jobIdOrUrl: string): TapJobReference {
  if (isAbsoluteHttpUrl(jobIdOrUrl)) {
    const url = new URL(jobIdOrUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const asyncIndex = parts.lastIndexOf("async");

    if (asyncIndex === -1 || asyncIndex !== parts.length - 2) {
      throw new Error("Absolute TAP job URLs must end with /async/<job-id>.");
    }

    const id = parts.at(-1) as string;
    const baseParts = parts.slice(0, asyncIndex);
    const basePath = baseParts.length === 0 ? "" : `/${baseParts.join("/")}`;

    return {
      baseUrl: `${url.origin}${basePath}`,
      id,
      kind: "absolute-url",
      url: url.href,
    };
  }

  if (jobIdOrUrl.includes("/")) {
    throw new Error(
      "Relative TAP job references must be bare job ids. Use an absolute /async/<job-id> URL otherwise.",
    );
  }

  return { id: jobIdOrUrl, kind: "bare-id" };
}

function createAsyncHttpOptions(
  options: SubmitTapAsyncJobOptions,
): TapHttpRequestOptions {
  const httpOptions: TapHttpRequestOptions = {
    acceptedStatuses: [303],
    redirect: "manual",
  };

  if (options.fetch !== undefined) {
    httpOptions.fetch = options.fetch;
  }

  if (options.signal !== undefined) {
    httpOptions.signal = options.signal;
  }

  if (options.userAgent !== undefined) {
    httpOptions.userAgent = options.userAgent;
  }

  return httpOptions;
}

/**
 * Create a TAP async job handle from a job ID or absolute job URL.
 */
export function createTapJob(
  jobIdOrUrl: string,
  baseUrl: string,
  options: TapJobOptions = {},
): TapJob {
  const jobUrl = resolveJobUrl(jobIdOrUrl, baseUrl);
  const id = jobUrl.pathname.split("/").filter(Boolean).at(-1);

  if (id === undefined) {
    throw new TapHttpError(`TAP async job URL has no job id: ${jobIdOrUrl}`);
  }

  const readStatus = async (
    signal: AbortSignal | undefined = options.signal,
  ): Promise<TapJobStatus> => {
    const statusOptions: TapJobOptions = { ...options };

    if (signal !== undefined) {
      statusOptions.signal = signal;
    }

    const response = await tapGetUrl(
      jobUrl.href,
      createJobHttpOptions(statusOptions),
    );
    return parseUwsJobStatus(await response.text(), jobUrl);
  };

  return {
    id,
    url: jobUrl.href,
    async status() {
      return readStatus(options.signal);
    },
    async wait(waitOptions: TapJobWaitOptions = {}) {
      return waitForTapJob(readStatus, waitOptions);
    },
    async fetch(fetchOptions: TapJobFetchOptions = {}) {
      const format = fetchOptions.format ?? options.format ?? "votable";
      assertSupportedSyncFormat(format);
      const resultUrl = new URL("results/result", `${jobUrl.href}/`).href;
      const resultOptions: TapJobOptions = { ...options };

      if (fetchOptions.signal !== undefined) {
        resultOptions.signal = fetchOptions.signal;
      }

      const response = await tapGetUrl(
        resultUrl,
        createJobHttpOptions(resultOptions),
      );

      return createTapResultFromResponse(format, response);
    },
    async delete() {
      await tapDeleteUrl(jobUrl.href, {
        ...createJobHttpOptions(options),
        acceptedStatuses: [303],
        redirect: "manual",
      });
    },
  };
}

function resolveJobUrl(jobIdOrUrl: string, baseUrl: string): URL {
  const reference = parseTapJobReference(jobIdOrUrl);

  if (reference.kind === "absolute-url") {
    return new URL(reference.url);
  }

  return new URL(reference.id, `${baseUrl.replace(/\/+$/, "")}/`);
}

function createJobHttpOptions(options: TapJobOptions): TapHttpRequestOptions {
  const httpOptions: TapHttpRequestOptions = {};

  if (options.fetch !== undefined) {
    httpOptions.fetch = options.fetch;
  }

  if (options.signal !== undefined) {
    httpOptions.signal = options.signal;
  }

  if (options.userAgent !== undefined) {
    httpOptions.userAgent = options.userAgent;
  }

  return httpOptions;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
