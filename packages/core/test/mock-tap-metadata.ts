import { readCoreFixture } from "./fixtures.js";

export type MockTapMetadataRequest = {
  url: URL;
  method: string;
  signal: AbortSignal | null;
};

export type MockTapMetadataFetch = typeof fetch & {
  requests: MockTapMetadataRequest[];
};

export type MockTapMetadataRoutes = Readonly<Record<string, string | Response>>;

export { readCoreFixture };

export function createMockTapMetadataFetch(
  routes: MockTapMetadataRoutes,
): MockTapMetadataFetch {
  const requests: MockTapMetadataRequest[] = [];

  const mockFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    requests.push({
      url,
      method: request.method,
      signal: init?.signal ?? null,
    });

    if (request.method !== "GET") {
      throw new Error(`Expected TAP metadata GET, received ${request.method}`);
    }

    const route = routes[url.pathname];

    if (route === undefined) {
      throw new Error(`Unexpected TAP metadata path ${url.pathname}`);
    }

    if (route instanceof Response) {
      return route.clone();
    }

    return new Response(await readCoreFixture(route), {
      headers: { "content-type": "application/xml" },
    });
  };

  return Object.assign(mockFetch, { requests }) as MockTapMetadataFetch;
}
