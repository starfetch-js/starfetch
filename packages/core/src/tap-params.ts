import type { TapSyncFormat } from "./tap-format.js";
import { TapUploadError } from "./errors.js";

/** TAP upload descriptor for URI or inline VOTable uploads. */
export type TapUpload = TapUploadUri | TapUploadInline;

/** TAP upload that lets the service retrieve a remote table resource. */
export type TapUploadUri = {
  /** ADQL table name used as `TAP_UPLOAD.<tableName>`. */
  tableName: string;
  /** Service-readable `http:`, `https:`, or `vos:` URI. */
  uri: string;
};

/** TAP upload that sends VOTable content inline with the request body. */
export type TapUploadInline = {
  /** ADQL table name used as `TAP_UPLOAD.<tableName>`. */
  tableName: string;
  /** VOTable XML content sent as a multipart form part. */
  votable: string | Blob | ArrayBuffer | Uint8Array;
  /** Optional multipart filename for the inline VOTable part. */
  filename?: string;
};

/** Complete TAP query parameter options used by request encoders. */
export type TapQueryParamOptions = {
  /** TAP `RESPONSEFORMAT` value. */
  format?: TapSyncFormat;
  /** TAP `LANG` value; defaults to `ADQL`. */
  language?: string;
  /** TAP `MAXREC` service-side row limit. */
  maxrec?: number;
  /** Optional compatibility `REQUEST` parameter for services that require it. */
  request?: "doQuery";
  /** TAP `RUNID` request tracking value. */
  runId?: string;
  /** TAP `UPLOAD` descriptors. */
  uploads?: readonly TapUpload[];
};

/** TAP request options shared by sync and async query submissions. */
export type TapRequestParameterOptions = Pick<
  TapQueryParamOptions,
  "maxrec" | "runId" | "uploads"
>;

/**
 * Build TAP query parameter options from public request options and a format.
 */
export function createTapQueryParamOptions(
  options: TapRequestParameterOptions,
  format?: TapSyncFormat,
): TapQueryParamOptions {
  const paramsOptions: TapQueryParamOptions = {};

  if (format !== undefined) {
    paramsOptions.format = format;
  }

  if (options.maxrec !== undefined) {
    paramsOptions.maxrec = options.maxrec;
  }

  if (options.runId !== undefined) {
    paramsOptions.runId = options.runId;
  }

  if (options.uploads !== undefined) {
    paramsOptions.uploads = options.uploads;
  }

  return paramsOptions;
}

/**
 * Build URL-encoded TAP query parameters.
 *
 * Use {@link buildTapQueryBody} instead when inline uploads may be present.
 *
 * @throws TapUploadError when an inline upload requires multipart encoding.
 */
export function buildTapQueryParams(
  adql: string,
  options: TapQueryParamOptions = {},
): URLSearchParams {
  const uploads = createTapUploadParameters(options.uploads);

  if (uploads.some((upload) => upload.kind === "inline")) {
    throw new TapUploadError(
      "Inline TAP uploads require a multipart TAP query body.",
    );
  }

  const params = buildBaseTapQueryParams(adql, options);

  for (const upload of uploads) {
    params.append("UPLOAD", upload.value);
  }

  return params;
}

/**
 * Build a TAP query request body as URL parameters or multipart form data.
 *
 * The body always includes `LANG` and `QUERY`, and adds `RESPONSEFORMAT`,
 * `MAXREC`, `RUNID`, `REQUEST`, and `UPLOAD` when provided.
 */
export function buildTapQueryBody(
  adql: string,
  options: TapQueryParamOptions = {},
): URLSearchParams | FormData {
  const uploads = createTapUploadParameters(options.uploads);

  if (!uploads.some((upload) => upload.kind === "inline")) {
    const params = buildBaseTapQueryParams(adql, options);

    for (const upload of uploads) {
      params.append("UPLOAD", upload.value);
    }

    return params;
  }

  const formData = new FormData();
  const params = buildBaseTapQueryParams(adql, options);

  for (const [key, value] of params) {
    formData.append(key, value);
  }

  for (const upload of uploads) {
    formData.append("UPLOAD", upload.value);

    if (upload.kind === "inline") {
      const blob = createVotableBlob(upload.votable);

      if (upload.filename !== undefined) {
        formData.append(upload.parameterName, blob, upload.filename);
      } else {
        formData.append(upload.parameterName, blob);
      }
    }
  }

  return formData;
}

function buildBaseTapQueryParams(
  adql: string,
  options: TapQueryParamOptions,
): URLSearchParams {
  const params = new URLSearchParams();

  params.set("LANG", options.language ?? "ADQL");
  params.set("QUERY", adql);

  if (options.format) {
    params.set("RESPONSEFORMAT", options.format);
  }

  if (options.request !== undefined) {
    params.set("REQUEST", options.request);
  }

  if (options.maxrec !== undefined) {
    params.set("MAXREC", String(options.maxrec));
  }

  if (options.runId !== undefined) {
    params.set("RUNID", options.runId);
  }

  return params;
}

type TapUploadParameter =
  | {
      kind: "uri";
      value: string;
    }
  | {
      kind: "inline";
      parameterName: string;
      value: string;
      votable: TapUploadInline["votable"];
      filename?: string;
    };

function createTapUploadParameters(
  uploads: readonly TapUpload[] | undefined,
): TapUploadParameter[] {
  if (uploads === undefined || uploads.length === 0) {
    return [];
  }

  const names = new Set<string>();

  return uploads.map((upload, index) => {
    validateTapUploadTableName(upload.tableName);

    const foldedName = upload.tableName.toLowerCase();

    if (names.has(foldedName)) {
      throw new TapUploadError(
        `Duplicate TAP upload table name: ${upload.tableName}`,
      );
    }

    names.add(foldedName);

    if ("uri" in upload) {
      validateTapUploadUri(upload.uri);

      return {
        kind: "uri",
        value: `${upload.tableName},${upload.uri}`,
      };
    }

    const parameterName = `starfetch_upload_${index}`;
    const inlineUpload: TapUploadParameter = {
      kind: "inline",
      parameterName,
      value: `${upload.tableName},param:${parameterName}`,
      votable: upload.votable,
    };

    if (upload.filename !== undefined) {
      inlineUpload.filename = upload.filename;
    }

    return inlineUpload;
  });
}

function validateTapUploadTableName(tableName: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName)) {
    throw new TapUploadError(
      `Invalid TAP upload table name: ${tableName}. Upload table names must be unqualified ADQL regular identifiers.`,
    );
  }
}

function validateTapUploadUri(uri: string): void {
  let parsed: URL;

  try {
    parsed = new URL(uri);
  } catch {
    throw new TapUploadError(`Invalid TAP upload URI: ${uri}`);
  }

  if (!["http:", "https:", "vos:"].includes(parsed.protocol)) {
    throw new TapUploadError(`Unsupported TAP upload URI scheme: ${uri}`);
  }
}

function createVotableBlob(votable: TapUploadInline["votable"]): Blob {
  if (votable instanceof Blob) {
    return votable;
  }

  return new Blob([votable as BlobPart], {
    type: "application/x-votable+xml",
  });
}
