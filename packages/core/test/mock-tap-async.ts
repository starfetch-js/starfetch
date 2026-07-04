import { readCoreFixture } from "./fixtures.js";
import { readMockFormData } from "./mock-tap-form.js";

export type UwsPhase =
  | "PENDING"
  | "QUEUED"
  | "EXECUTING"
  | "COMPLETED"
  | "ERROR"
  | "ABORTED"
  | "ARCHIVED";

export type MockTapAsyncRequest = {
  url: URL;
  method: string;
  body: string;
  contentType: string | null;
  formData: Map<string, string>;
  params: URLSearchParams;
  redirect: RequestRedirect;
  signal: AbortSignal | null;
  userAgent: string | null;
};

export type MockTapAsyncFetch = typeof fetch & {
  requests: MockTapAsyncRequest[];
};

export type MockTapAsyncConfig = {
  jobId?: string;
  phase?: UwsPhase;
  phases?: UwsPhase[];
  resultFixture?: string;
  resultContentType?: string;
  errorFixture?: string;
};

export { readCoreFixture };

export function createMockTapAsyncFetch(
  config: MockTapAsyncConfig = {},
): MockTapAsyncFetch {
  const requests: MockTapAsyncRequest[] = [];
  const jobId = config.jobId ?? "job-123";
  const phases = config.phases ?? [config.phase ?? "PENDING"];
  const resultFixture = config.resultFixture ?? "uws-result.votable.xml";
  const resultContentType =
    config.resultContentType ?? "application/x-votable+xml";
  const errorFixture = config.errorFixture ?? "uws-error-detail.txt";
  let phaseIndex = 0;
  let deleted = false;

  const mockFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    if (url.pathname.endsWith("/capabilities")) {
      return new Response("not found", { status: 404 });
    }

    const asyncPath = getAsyncPath(url);

    if (asyncPath === null) {
      throw new Error(`Expected TAP /async request, received ${url.pathname}`);
    }

    const contentType = request.headers.get("content-type");
    const body = await request.clone().text();
    const formData = await readMockFormData(request, contentType);
    requests.push({
      url,
      method: request.method,
      body,
      contentType,
      formData,
      params: new URLSearchParams(body),
      redirect: request.redirect,
      signal: init?.signal ?? null,
      userAgent: request.headers.get("user-agent"),
    });

    if (asyncPath.length === 0) {
      return createJobResponse(request, url, jobId);
    }

    if (asyncPath[0] !== jobId) {
      return new Response("UWS job not found", { status: 404 });
    }

    if (request.method === "DELETE" && asyncPath.length === 1) {
      deleted = true;
      return new Response(null, {
        status: 303,
        headers: { location: createJobListUrl(url) },
      });
    }

    if (deleted) {
      return new Response("UWS job not found", { status: 404 });
    }

    if (asyncPath.length === 1) {
      assertMethod(request, "GET", "job");
      return fixtureResponse(
        jobFixtureForPhase(readPhase(true)),
        "application/xml",
      );
    }

    if (asyncPath[1] === "phase" && asyncPath.length === 2) {
      return handlePhaseRequest(
        request,
        readPhase(false),
        url,
        new URLSearchParams(body),
      );
    }

    if (
      asyncPath[1] === "results" &&
      asyncPath[2] === "result" &&
      asyncPath.length === 3
    ) {
      assertMethod(request, "GET", "result");
      return fixtureResponse(resultFixture, resultContentType);
    }

    if (asyncPath[1] === "error" && asyncPath.length === 2) {
      assertMethod(request, "GET", "error");
      return fixtureResponse(errorFixture, "text/plain");
    }

    throw new Error(`Unexpected TAP async path ${url.pathname}`);
  };

  return Object.assign(mockFetch, { requests }) as MockTapAsyncFetch;

  function readPhase(advance: boolean): UwsPhase {
    const phase = phases[Math.min(phaseIndex, phases.length - 1)] ?? "PENDING";

    if (advance && phaseIndex < phases.length - 1) {
      phaseIndex += 1;
    }

    return phase;
  }
}

function getAsyncPath(url: URL): string[] | null {
  const parts = url.pathname.split("/").filter(Boolean);
  const asyncIndex = parts.indexOf("async");

  if (asyncIndex === -1) {
    return null;
  }

  return parts.slice(asyncIndex + 1);
}

function createJobResponse(
  request: Request,
  url: URL,
  jobId: string,
): Response {
  assertMethod(request, "POST", "job creation");

  return new Response(null, {
    status: 303,
    headers: {
      location: new URL(`${trimTrailingSlash(url.pathname)}/${jobId}`, url)
        .href,
    },
  });
}

function createJobListUrl(url: URL): string {
  const parts = url.pathname.split("/").filter(Boolean);
  const asyncIndex = parts.indexOf("async");
  const listPath = `/${parts.slice(0, asyncIndex + 1).join("/")}`;

  return new URL(listPath, url).href;
}

function handlePhaseRequest(
  request: Request,
  phase: UwsPhase,
  url: URL,
  params: URLSearchParams,
): Response {
  if (request.method === "GET") {
    return new Response(phase, {
      headers: { "content-type": "text/plain" },
    });
  }

  if (request.method === "POST") {
    const requestedPhase = params.get("PHASE");

    if (requestedPhase !== "RUN" && requestedPhase !== "ABORT") {
      throw new Error(
        `Expected TAP async phase change PHASE=RUN or PHASE=ABORT, received ${requestedPhase ?? "missing PHASE"}`,
      );
    }

    return new Response(null, {
      status: 303,
      headers: { location: new URL("..", `${url.href}/`).href },
    });
  }

  throw new Error(
    `Expected TAP async GET or POST for phase, received ${request.method}`,
  );
}

async function fixtureResponse(
  fixtureName: string,
  contentType: string,
): Promise<Response> {
  return new Response(await readCoreFixture(fixtureName), {
    headers: { "content-type": contentType },
  });
}

function assertMethod(
  request: Request,
  expectedMethod: string,
  resource: string,
): void {
  if (request.method !== expectedMethod) {
    throw new Error(
      `Expected TAP async ${expectedMethod} for ${resource}, received ${request.method}`,
    );
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function jobFixtureForPhase(phase: UwsPhase): string {
  switch (phase) {
    case "PENDING":
      return "uws-job-pending.xml";
    case "QUEUED":
      return "uws-job-queued.xml";
    case "EXECUTING":
      return "uws-job-executing.xml";
    case "COMPLETED":
      return "uws-job-completed.xml";
    case "ERROR":
      return "uws-job-error.xml";
    case "ABORTED":
      return "uws-job-aborted.xml";
    case "ARCHIVED":
      return "uws-job-archived.xml";
  }
}
