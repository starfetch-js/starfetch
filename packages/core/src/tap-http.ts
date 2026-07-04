import { TapHttpError, TapServiceError } from "./errors.js";
import { parseVotableStatus } from "./votable.js";

export type TapHttpRequestOptions = {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  redirect?: RequestRedirect;
  acceptedStatuses?: readonly number[];
  userAgent?: string;
};

type TapHttpMethod = "DELETE" | "GET" | "POST";
type TapPostBody = URLSearchParams | FormData;

export function buildTapChildUrl(baseUrl: string, childResource: string): URL {
  const base = new URL(`${baseUrl.replace(/\/+$/, "")}/`);
  const child = childResource.replace(/^\/+/, "");

  return new URL(child, base);
}

export function tapGet(
  baseUrl: string,
  childResource: string,
  options: TapHttpRequestOptions = {},
): Promise<Response> {
  return requestTapResource(baseUrl, childResource, "GET", options);
}

export function tapGetUrl(
  url: string,
  options: TapHttpRequestOptions = {},
): Promise<Response> {
  return requestUrl(new URL(url), "GET", options);
}

export function tapDeleteUrl(
  url: string,
  options: TapHttpRequestOptions = {},
): Promise<Response> {
  return requestUrl(new URL(url), "DELETE", options);
}

export function tapPostForm(
  baseUrl: string,
  childResource: string,
  body: TapPostBody,
  options: TapHttpRequestOptions = {},
): Promise<Response> {
  return requestTapResource(baseUrl, childResource, "POST", options, body);
}

async function requestTapResource(
  baseUrl: string,
  childResource: string,
  method: TapHttpMethod,
  options: TapHttpRequestOptions,
  body?: TapPostBody,
): Promise<Response> {
  const url = buildTapChildUrl(baseUrl, childResource);
  return requestUrl(url, method, options, body);
}

async function requestUrl(
  url: URL,
  method: TapHttpMethod,
  options: TapHttpRequestOptions,
  body?: TapPostBody,
): Promise<Response> {
  const requestInit: RequestInit = { method };
  const headers = new Headers();
  let hasHeaders = false;

  if (body !== undefined) {
    requestInit.body = body;

    if (body instanceof URLSearchParams) {
      headers.set("content-type", "application/x-www-form-urlencoded");
      hasHeaders = true;
    }
  }

  if (options.userAgent !== undefined) {
    headers.set("user-agent", options.userAgent);
    hasHeaders = true;
  }

  if (hasHeaders) {
    requestInit.headers = headers;
  }

  if (options.signal !== undefined) {
    requestInit.signal = options.signal;
  }

  if (options.redirect !== undefined) {
    requestInit.redirect = options.redirect;
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;

  let response: Response;

  try {
    response = await fetchImpl(url, requestInit);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown network failure";
    throw new TapHttpError(`TAP request failed: ${message}`);
  }

  if (
    !response.ok &&
    !(options.acceptedStatuses ?? []).includes(response.status)
  ) {
    await assertNoTapServiceError(response);

    throw new TapHttpError(
      `TAP request failed with HTTP ${response.status} ${response.statusText}`.trim(),
      { status: response.status, statusText: response.statusText },
    );
  }

  return response;
}

async function assertNoTapServiceError(response: Response): Promise<void> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("votable") && !contentType.includes("xml")) {
    return;
  }

  let queryStatus;

  try {
    queryStatus = parseVotableStatus(await response.clone().text()).queryStatus;
  } catch {
    return;
  }

  if (queryStatus?.value?.toUpperCase() !== "ERROR") {
    return;
  }

  throw new TapServiceError(
    `TAP service error: ${queryStatus.message ?? "QUERY_STATUS ERROR"}`,
  );
}
