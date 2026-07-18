import type { LookupAddress } from "node:dns";
import type { LookupFunction } from "node:net";

import { Agent, fetch as undiciFetch } from "undici";

export type PinnedHttpRequest = Readonly<{
  addresses: readonly LookupAddress[];
  request: Request;
  url: URL;
  userAgent: string;
}>;

export type PinnedHttpResponse = Readonly<{
  body: ReadableStream<Uint8Array> | null;
  close(): Promise<void>;
  headers: Headers;
  status: number;
  statusText: string;
}>;

export type PinnedHttpTransport = Readonly<{
  request(input: PinnedHttpRequest): Promise<PinnedHttpResponse>;
}>;

export function createUndiciPinnedHttpTransport(): PinnedHttpTransport {
  return {
    async request(input) {
      const dispatcher = new Agent({
        connect: { lookup: createPinnedLookup(input.addresses) },
      });
      const headers = new Headers(input.request.headers);
      headers.set("user-agent", input.userAgent);

      try {
        const response = await undiciFetch(input.url, {
          ...(input.request.method === "GET" || input.request.method === "HEAD"
            ? {}
            : {
                body: input.request.body as never,
                duplex: "half" as const,
              }),
          dispatcher,
          headers: Object.fromEntries(headers.entries()),
          method: input.request.method,
          redirect: "manual",
          signal: input.request.signal,
        });
        const responseHeaders = new Headers();
        response.headers.forEach((value, name) => {
          responseHeaders.append(name, value);
        });

        return {
          body: response.body as unknown as ReadableStream<Uint8Array> | null,
          close: () => dispatcher.close(),
          headers: responseHeaders,
          status: response.status,
          statusText: response.statusText,
        };
      } catch (error) {
        await dispatcher.close();
        throw error;
      }
    },
  };
}

export function createPinnedLookup(
  addresses: readonly LookupAddress[],
): LookupFunction {
  let next = 0;
  return (_hostname, options, callback) => {
    const candidates =
      options.family === 4 || options.family === 6
        ? addresses.filter(({ family }) => family === options.family)
        : addresses;
    if (candidates.length === 0) {
      callback(
        new Error("No pinned address matches the requested family."),
        "",
        4,
      );
      return;
    }
    if (options.all) {
      callback(null, [...candidates]);
      return;
    }
    const selected = candidates[next++ % candidates.length];
    if (selected === undefined) {
      callback(new Error("No pinned address available."), "", 4);
      return;
    }
    callback(null, selected.address, selected.family);
  };
}
