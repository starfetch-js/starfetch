import { readCoreFixture } from "./fixtures.js";
import { readMockFormData } from "./mock-tap-form.js";

export type MockTapSyncRequest = {
  url: URL;
  method: string;
  body: string;
  contentType: string | null;
  formData: Map<string, string>;
  params: URLSearchParams;
  signal: AbortSignal | null;
  userAgent: string | null;
};

export type MockTapSyncResourceRequest =
  | (MockTapSyncRequest & { resource: "sync" })
  | {
      resource: "capabilities";
      url: URL;
      method: string;
      body: "";
      contentType: null;
      formData: Map<string, string>;
      params: URLSearchParams;
      signal: AbortSignal | null;
      userAgent: string | null;
    };

export type MockTapSyncHandler = (
  request: MockTapSyncRequest,
) => Response | Promise<Response>;

export type MockTapSyncOptions = {
  capabilities?: string | Response;
};

export type MockTapSyncFetch = typeof fetch & {
  requests: MockTapSyncRequest[];
  allRequests: MockTapSyncResourceRequest[];
};

export { readCoreFixture };

export function createMockTapSyncFetch(
  handlerOrResponse: MockTapSyncHandler | Response,
  options: MockTapSyncOptions = {},
): MockTapSyncFetch {
  const requests: MockTapSyncRequest[] = [];
  const allRequests: MockTapSyncResourceRequest[] = [];

  const mockFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    if (url.pathname.endsWith("/capabilities")) {
      if (request.method !== "GET") {
        throw new Error(
          `Expected TAP /capabilities GET, received ${request.method}`,
        );
      }

      allRequests.push({
        body: "",
        contentType: null,
        formData: new Map(),
        method: request.method,
        params: new URLSearchParams(),
        resource: "capabilities",
        signal: init?.signal ?? null,
        userAgent: request.headers.get("user-agent"),
        url,
      });

      if (options.capabilities instanceof Response) {
        return options.capabilities.clone();
      }

      if (options.capabilities !== undefined) {
        return new Response(await readCoreFixture(options.capabilities), {
          headers: { "content-type": "application/xml" },
        });
      }

      return new Response("not found", { status: 404 });
    }

    if (!url.pathname.endsWith("/sync")) {
      throw new Error(`Expected TAP /sync request, received ${url.pathname}`);
    }

    if (request.method !== "POST") {
      throw new Error(`Expected TAP /sync POST, received ${request.method}`);
    }

    const contentType = request.headers.get("content-type");
    const body = await request.clone().text();
    const formData = await readMockFormData(request, contentType);
    const capturedRequest = {
      url,
      method: request.method,
      body,
      contentType,
      formData,
      params: new URLSearchParams(body),
      signal: init?.signal ?? null,
      userAgent: request.headers.get("user-agent"),
    };

    requests.push(capturedRequest);
    allRequests.push({ ...capturedRequest, resource: "sync" });

    if (handlerOrResponse instanceof Response) {
      return handlerOrResponse.clone();
    }

    return handlerOrResponse(capturedRequest);
  };

  return Object.assign(mockFetch, {
    allRequests,
    requests,
  }) as MockTapSyncFetch;
}
