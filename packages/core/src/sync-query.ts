import {
  createTapResultFromResponse,
  type TapResult,
} from "./tap-result-output.js";
import { tapSyncFormats, type TapSyncFormat } from "./tap-format.js";
import {
  buildTapQueryBody,
  createTapQueryParamOptions,
  type TapUpload,
} from "./tap-params.js";
import { tapPostForm } from "./tap-http.js";
import type { ResolvedTapTarget } from "./target-resolver.js";
import { TapFormatUnsupportedError } from "./errors.js";
import { assertTapSyncQuerySupported } from "./vosi-metadata.js";

/** Options for TAP sync query and async job submission. */
export type QueryOptions = {
  /** TAP service response format; defaults to `votable`. */
  format?: TapSyncFormat;
  /** TAP `MAXREC` service-side row limit. */
  maxrec?: number;
  /** TAP `RUNID` request tracking value. */
  runId?: string;
  /** TAP `UPLOAD` descriptors. */
  uploads?: readonly TapUpload[];
  /** Abort signal for the TAP request. */
  signal?: AbortSignal;
};

type ExecuteTapSyncQueryOptions = QueryOptions & {
  fetch?: typeof fetch;
  userAgent?: string;
};

const supportedSyncFormats = new Set<string>(tapSyncFormats);

/**
 * Execute an ADQL query through TAP `/sync`.
 *
 * @throws TapAuthUnsupportedError when capabilities advertise auth-only TAP.
 * @throws TapFormatUnsupportedError when the requested format is unsupported.
 * @throws TapHttpError for HTTP failures before TAP error parsing succeeds.
 * @throws TapServiceError for TAP-reported service errors.
 */
export async function executeTapSyncQuery(
  target: ResolvedTapTarget,
  adql: string,
  options: ExecuteTapSyncQueryOptions = {},
): Promise<TapResult> {
  const format = options.format ?? "votable";
  assertSupportedSyncFormat(format);
  const queryParamOptions = createTapQueryParamOptions(options, format);

  if (target.syncRequest !== undefined) {
    queryParamOptions.request = target.syncRequest;
  }

  const body = buildTapQueryBody(adql, queryParamOptions);
  await assertTapSyncQuerySupported(target, format, options);
  const response = await tapPostForm(target.baseUrl, "sync", body, options);

  return createTapResultFromResponse(format, response);
}

/** Assert that a string is a supported TAP sync request format. */
export function assertSupportedSyncFormat(
  format: string,
): asserts format is TapSyncFormat {
  if (!supportedSyncFormats.has(format)) {
    throw new TapFormatUnsupportedError(
      `Unsupported TAP sync format: ${format}. Supported formats: ${tapSyncFormats.join(", ")}.`,
    );
  }
}
