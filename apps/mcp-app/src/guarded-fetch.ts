import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";

import ipaddr from "ipaddr.js";

import {
  createUndiciPinnedHttpTransport,
  type PinnedHttpTransport,
} from "./pinned-http-transport.js";

export class HostedFetchPolicyError extends Error {
  override readonly name = "HostedFetchPolicyError";

  constructor(
    readonly code:
      | "AUTHORITY_FORBIDDEN"
      | "CONCURRENCY_EXCEEDED"
      | "REDIRECT_FORBIDDEN"
      | "RESPONSE_TOO_LARGE"
      | "TARGET_FORBIDDEN",
    message: string,
  ) {
    super(`HostedFetchPolicyError[${code}]: ${message}`);
  }
}

export type GuardedFetchOptions = Readonly<{
  maxConcurrency: number;
  maxRedirects: number;
  maxResponseBytes: number;
  resolve?: (
    hostname: string,
    signal: AbortSignal,
  ) => Promise<readonly LookupAddress[]>;
  transport?: PinnedHttpTransport;
  userAgent: string;
}>;

export function createGuardedFetch(options: GuardedFetchOptions): typeof fetch {
  let active = 0;
  const transport = options.transport ?? createUndiciPinnedHttpTransport();

  return async (input, init) => {
    if (active >= options.maxConcurrency) {
      throw new HostedFetchPolicyError(
        "CONCURRENCY_EXCEEDED",
        "Too many outbound TAP requests are active.",
      );
    }
    active += 1;
    try {
      assertUrlAllowed(new URL(input instanceof Request ? input.url : input));
      const request = new Request(input, init);
      const method = request.method.toUpperCase();
      assertNoAuthority(request);
      let current = new URL(request.url);
      let addresses = await assertTarget(
        current,
        options.resolve,
        request.signal,
      );

      for (let redirects = 0; ; redirects += 1) {
        const response = await requestHop(
          current,
          request,
          addresses,
          transport,
          options,
        );
        const location = response.headers.get("location");
        const redirect =
          location === null ? undefined : new URL(location, current);
        let redirectAddresses: readonly LookupAddress[] | undefined;

        if (redirect !== undefined) {
          redirectAddresses = await assertTarget(
            redirect,
            options.resolve,
            request.signal,
          );
          if (redirect.origin !== current.origin) {
            throw new HostedFetchPolicyError(
              "REDIRECT_FORBIDDEN",
              "TAP redirects must remain on the same origin.",
            );
          }
        }

        if (
          redirect !== undefined &&
          isRedirect(response.status) &&
          (method === "GET" || method === "HEAD")
        ) {
          if (redirects >= options.maxRedirects) {
            throw new HostedFetchPolicyError(
              "REDIRECT_FORBIDDEN",
              "Too many TAP redirects.",
            );
          }
          if (redirectAddresses === undefined) {
            throw new HostedFetchPolicyError(
              "REDIRECT_FORBIDDEN",
              "Redirect target was not validated.",
            );
          }
          current = redirect;
          addresses = redirectAddresses;
          continue;
        }

        return response;
      }
    } finally {
      active -= 1;
    }
  };
}

async function requestHop(
  url: URL,
  request: Request,
  addresses: readonly LookupAddress[],
  transport: PinnedHttpTransport,
  options: GuardedFetchOptions,
): Promise<globalThis.Response> {
  const response = await transport.request({
    addresses,
    request,
    url,
    userAgent: options.userAgent,
  });

  try {
    const contentLength = response.headers.get("content-length");
    if (
      contentLength !== null &&
      Number(contentLength) > options.maxResponseBytes
    ) {
      await response.body?.cancel();
      throw new HostedFetchPolicyError(
        "RESPONSE_TOO_LARGE",
        `TAP response exceeds ${options.maxResponseBytes} bytes.`,
      );
    }
    const body = await readBounded(
      response.body,
      options.maxResponseBytes,
      request.signal,
    );
    const arrayBuffer = new ArrayBuffer(body.byteLength);
    new Uint8Array(arrayBuffer).set(body);
    return new Response(body.byteLength === 0 ? null : arrayBuffer, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  } finally {
    await response.close();
  }
}

async function assertTarget(
  url: URL,
  resolver: GuardedFetchOptions["resolve"],
  signal: AbortSignal,
): Promise<readonly LookupAddress[]> {
  assertUrlAllowed(url);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = ipaddr.isValid(hostname)
    ? [
        {
          address: hostname,
          family: ipaddr.parse(hostname).kind() === "ipv4" ? 4 : 6,
        },
      ]
    : await resolveWithSignal(resolver ?? resolveAll, hostname, signal);
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicIp(address))
  ) {
    throw new HostedFetchPolicyError(
      "TARGET_FORBIDDEN",
      "TAP target must resolve only to public IP addresses.",
    );
  }
  return addresses;
}

function assertUrlAllowed(url: URL): void {
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    throw new HostedFetchPolicyError(
      "TARGET_FORBIDDEN",
      "Hosted Starfetch only connects to credential-free HTTPS TAP URLs.",
    );
  }
}

export function isPublicIp(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  return ipaddr.process(address).range() === "unicast";
}

function assertNoAuthority(request: Request): void {
  if (request.headers.has("authorization") || request.headers.has("cookie")) {
    throw new HostedFetchPolicyError(
      "AUTHORITY_FORBIDDEN",
      "Hosted Starfetch does not forward credentials.",
    );
  }
}

async function resolveAll(hostname: string): Promise<readonly LookupAddress[]> {
  return dnsLookup(hostname, { all: true, order: "verbatim" });
}

function resolveWithSignal(
  resolver: NonNullable<GuardedFetchOptions["resolve"]>,
  hostname: string,
  signal: AbortSignal,
): Promise<readonly LookupAddress[]> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    void resolver(hostname, signal).then(
      (addresses) => {
        signal.removeEventListener("abort", onAbort);
        resolve(addresses);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  maximum: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (body === null) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await readChunk(reader, signal);
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new HostedFetchPolicyError(
        "RESPONSE_TOO_LARGE",
        `TAP response exceeds ${maximum} bytes.`,
      );
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function readChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
      void reader.cancel(signal.reason).catch(() => undefined);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    void reader.read().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function isRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}
