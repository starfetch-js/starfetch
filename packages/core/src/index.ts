import {
  resolveTapTarget,
  type ResolvedTapTarget,
  type TapTarget,
} from "./target-resolver.js";
import {
  assertSupportedSyncFormat,
  executeTapSyncQuery,
  type QueryOptions,
} from "./sync-query.js";
import type { TapResult } from "./tap-result-output.js";
import type { TapSyncFormat } from "./tap-format.js";
import {
  createTapJob,
  submitTapAsyncJob,
  type TapJobsClient,
} from "./async-job-submit.js";
import {
  readTapAvailability,
  readTapCapabilities,
  readTapColumns,
  readTapTables,
  type TapAvailability,
  type TapCapabilities,
  type TapColumn,
  type TapRequestOptions,
  type TapTable,
} from "./vosi-metadata.js";

export type { ResolvedTapTarget, TapTarget } from "./target-resolver.js";
export {
  TapAuthUnsupportedError,
  StarfetchError,
  TapFormatUnsupportedError,
  TapHttpError,
  TapJobTerminalError,
  TapJobTimeoutError,
  TapParseError,
  TapServiceError,
  TapUploadError,
} from "./errors.js";
export { buildTapQueryBody, buildTapQueryParams } from "./tap-params.js";
export {
  tapOutputFormats,
  tapRequestFormatForOutput,
  tapServiceFormats,
  tapSyncFormats,
} from "./tap-format.js";
export { formatTapResult } from "./tap-result-output.js";
export { parseVotable } from "./votable.js";
export { defaultTapPresets } from "./tap-presets.js";
export { defaultRegistryUrl, registry } from "./registry.js";
export { resolveTapTarget } from "./target-resolver.js";
export { parseTapJobReference } from "./async-job-submit.js";
export { assertSupportedSyncFormat };
export type {
  TapOutputFormat,
  TapServiceFormat,
  TapSyncFormat,
} from "./tap-format.js";
export type { TapPreset, TapPresetRegistry } from "./tap-presets.js";
export type { TapResult, TapResultField } from "./tap-result-output.js";
export type { TapCellValue, TapRow } from "./tap-row.js";
export type {
  TapJob,
  TapJobFetchOptions,
  TapJobReference,
  TapJobsClient,
  TapJobStatus,
  TapJobWaitOptions,
} from "./async-job-submit.js";
export type { QueryOptions } from "./sync-query.js";
export type {
  TapRegistryClient,
  TapRegistryOptions,
  TapRegistrySearchOptions,
  TapRegistryService,
} from "./registry.js";
export type { TapUpload, TapUploadInline, TapUploadUri } from "./tap-params.js";
export type {
  TapAvailability,
  TapCapabilities,
  TapColumn,
  TapRequestOptions,
  TapTable,
} from "./vosi-metadata.js";
export type {
  VotableCellValue,
  VotableDocument,
  VotableField,
  VotableInfo,
  VotableRow,
} from "./votable.js";

/** Package name reported by the core library. */
export const packageName = "@starfetch-js/core";

/** Options shared by clients created with {@link tap}. */
export type TapClientOptions = {
  /** Custom fetch implementation for tests or non-default runtimes. */
  fetch?: typeof fetch;
  /** Reserved for callers that need to identify Starfetch HTTP requests. */
  userAgent?: string;
  /** Default TAP service response format for sync queries and async jobs. */
  defaultFormat?: TapSyncFormat;
};

type ClientTransportOptions = {
  fetch?: typeof fetch;
  userAgent?: string;
};

type ExecutableQueryOptions = QueryOptions & ClientTransportOptions;

type MetadataRequestOptions = TapRequestOptions & ClientTransportOptions;

type TapJobHandleOptions = ClientTransportOptions & {
  format?: TapSyncFormat;
};

/** Service-neutral TAP client for metadata, sync queries, and async jobs. */
export type TapClient = {
  /** Resolved TAP base URL and preset metadata used by this client. */
  target: ResolvedTapTarget;
  /** Client options supplied when the client was created. */
  options: TapClientOptions;
  /** Read TAP `/availability` metadata. */
  availability(options?: TapRequestOptions): Promise<TapAvailability>;
  /** Read TAP `/capabilities` metadata. */
  capabilities(options?: TapRequestOptions): Promise<TapCapabilities>;
  /** Read public table metadata from TAP `/tables`. */
  tables(options?: TapRequestOptions): Promise<TapTable[]>;
  /** Read columns for an exact table name from TAP `/tables`. */
  columns(tableName: string, options?: TapRequestOptions): Promise<TapColumn[]>;
  /**
   * Submit an ADQL query to the TAP `/sync` endpoint.
   *
   * @param adql - ADQL query text sent as TAP `QUERY`.
   * @param options - TAP request options such as `format`, `maxrec`, `runId`,
   *   `uploads`, and `signal`.
   * @returns A result wrapper for the TAP service response.
   * @throws TapAuthUnsupportedError when capabilities advertise auth-only TAP.
   * @throws TapFormatUnsupportedError when the requested format is unsupported.
   * @throws TapHttpError for HTTP failures before TAP error parsing succeeds.
   * @throws TapServiceError for TAP-reported service errors.
   */
  query(adql: string, options?: QueryOptions): Promise<TapResult>;
  /** Async TAP job operations for the client's target service. */
  jobs: TapJobsClient;
};

/**
 * Create a TAP client from a known service preset or explicit TAP base URL.
 *
 * @example
 * ```ts
 * import { tap } from "@starfetch-js/core";
 *
 * const client = tap("gaia");
 * const tables = await client.tables();
 * const result = await client.query(
 *   "SELECT TOP 5 source_id, ra, dec FROM gaiadr3.gaia_source",
 *   { format: "csv", maxrec: 5 },
 * );
 *
 * console.log(tables.length, await result.text());
 * ```
 *
 * @param target - Known service preset, TAP base URL, or target object.
 * @param options - Client defaults and dependency injection hooks.
 * @returns A TAP client bound to the resolved target.
 */
export function tap(
  target: TapTarget,
  options: TapClientOptions = {},
): TapClient {
  const resolvedTarget = resolveTapTarget(target);

  return {
    target: resolvedTarget,
    options,
    availability(requestOptions = {}) {
      return readTapAvailability(
        resolvedTarget,
        createMetadataOptions(requestOptions, options),
      );
    },
    capabilities(requestOptions = {}) {
      return readTapCapabilities(
        resolvedTarget,
        createMetadataOptions(requestOptions, options),
      );
    },
    tables(requestOptions = {}) {
      return readTapTables(
        resolvedTarget,
        createMetadataOptions(requestOptions, options),
      );
    },
    columns(tableName, requestOptions = {}) {
      return readTapColumns(
        resolvedTarget,
        tableName,
        createMetadataOptions(requestOptions, options),
      );
    },
    query(adql, queryOptions = {}) {
      return executeTapSyncQuery(
        resolvedTarget,
        adql,
        createExecutableQueryOptions(queryOptions, options),
      );
    },
    jobs: {
      submit(adql, queryOptions = {}) {
        return submitTapAsyncJob(
          resolvedTarget,
          adql,
          createExecutableQueryOptions(queryOptions, options),
        );
      },
      from(jobIdOrUrl) {
        return createTapJob(
          jobIdOrUrl,
          `${resolvedTarget.baseUrl.replace(/\/+$/, "")}/async/`,
          createTapJobHandleOptions(options),
        );
      },
    },
  };
}

function createExecutableQueryOptions(
  requestOptions: QueryOptions,
  clientOptions: TapClientOptions,
): ExecutableQueryOptions {
  const options: ExecutableQueryOptions = { ...requestOptions };

  if (
    options.format === undefined &&
    clientOptions.defaultFormat !== undefined
  ) {
    options.format = clientOptions.defaultFormat;
  }

  applyClientTransportOptions(options, clientOptions);
  return options;
}

function createMetadataOptions(
  requestOptions: TapRequestOptions,
  clientOptions: TapClientOptions,
): MetadataRequestOptions {
  const metadataOptions: MetadataRequestOptions = { ...requestOptions };

  applyClientTransportOptions(metadataOptions, clientOptions);
  return metadataOptions;
}

function createTapJobHandleOptions(
  clientOptions: TapClientOptions,
): TapJobHandleOptions {
  const options: TapJobHandleOptions = {};

  if (clientOptions.defaultFormat !== undefined) {
    options.format = clientOptions.defaultFormat;
  }

  applyClientTransportOptions(options, clientOptions);
  return options;
}

function applyClientTransportOptions(
  target: ClientTransportOptions,
  clientOptions: TapClientOptions,
): void {
  if (clientOptions.fetch !== undefined) {
    target.fetch = clientOptions.fetch;
  }

  if (clientOptions.userAgent !== undefined) {
    target.userAgent = clientOptions.userAgent;
  }
}
