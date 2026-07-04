import { describe, expect, it } from "vitest";

import {
  parseTapJobReference,
  tap,
  TapFormatUnsupportedError,
  TapHttpError,
  TapJobTerminalError,
  TapJobTimeoutError,
  TapServiceError,
  TapUploadError,
} from "./index.js";
import { createMockTapAsyncFetch } from "../test/mock-tap-async.js";

describe("TAP async job submit", () => {
  it("parses TAP async job references", () => {
    expect(parseTapJobReference("job-123")).toEqual({
      id: "job-123",
      kind: "bare-id",
    });
    expect(
      parseTapJobReference("https://example.test/tap/async/job-123"),
    ).toEqual({
      baseUrl: "https://example.test/tap",
      id: "job-123",
      kind: "absolute-url",
      url: "https://example.test/tap/async/job-123",
    });
  });

  it("rejects ambiguous TAP async job references", () => {
    expect(() => parseTapJobReference("async/job-123")).toThrow(
      "Relative TAP job references must be bare job ids.",
    );
    expect(() =>
      parseTapJobReference("https://example.test/tap/not-job"),
    ).toThrow("Absolute TAP job URLs must end with /async/<job-id>.");
  });

  it("creates a TAP async job handle from a job id", () => {
    const mockFetch = createMockTapAsyncFetch();
    const job = tap("https://example.test/tap", {
      fetch: mockFetch,
    }).jobs.from("job-123");

    expect(job.id).toBe("job-123");
    expect(job.url).toBe("https://example.test/tap/async/job-123");
    expect(job.status).toEqual(expect.any(Function));
    expect(job.wait).toEqual(expect.any(Function));
    expect(job.fetch).toEqual(expect.any(Function));
    expect(job.delete).toEqual(expect.any(Function));
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("creates a TAP async job handle from an absolute job URL", () => {
    const job = tap("https://example.test/tap").jobs.from(
      "https://archive.example/tap/async/job-abc",
    );

    expect(job.id).toBe("job-abc");
    expect(job.url).toBe("https://archive.example/tap/async/job-abc");
  });

  it("reads a running TAP async job status", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "EXECUTING" });

    const status = await tap("https://example.test/tap", {
      fetch: mockFetch,
    })
      .jobs.from("job-123")
      .status();

    expect(status).toEqual({
      phase: "EXECUTING",
    });
    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123",
    );
    expect(mockFetch.requests[0]?.method).toBe("GET");
  });

  it("reads a completed TAP async job result link", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });

    const status = await tap("https://example.test/tap", {
      fetch: mockFetch,
    })
      .jobs.from("job-123")
      .status();

    expect(status).toEqual({
      phase: "COMPLETED",
      resultUrl: "https://example.test/tap/async/job-123/results/result",
    });
  });

  it("reads a failed TAP async job error link and message", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "ERROR" });

    const status = await tap("https://example.test/tap", {
      fetch: mockFetch,
    })
      .jobs.from("job-123")
      .status();

    expect(status).toEqual({
      phase: "ERROR",
      errorUrl: "https://example.test/tap/async/job-123/error",
      message: "ADQL execution failed",
    });
  });

  it("waits until a TAP async job completes", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phases: ["PENDING", "EXECUTING", "COMPLETED"],
    });
    const progress: string[] = [];

    const status = await tap("https://example.test/tap", {
      fetch: mockFetch,
    })
      .jobs.from("job-123")
      .wait({
        intervalMs: 0,
        onProgress: (jobStatus) => {
          progress.push(jobStatus.phase);
        },
      });

    expect(status).toEqual({
      phase: "COMPLETED",
      resultUrl: "https://example.test/tap/async/job-123/results/result",
    });
    expect(progress).toEqual(["PENDING", "EXECUTING", "COMPLETED"]);
    expect(mockFetch.requests).toHaveLength(3);
  });

  it("rejects failed terminal phases while waiting for TAP async jobs", async () => {
    for (const phase of ["ERROR", "ABORTED", "ARCHIVED"] as const) {
      const mockFetch = createMockTapAsyncFetch({ phase });

      await expect(
        tap("https://example.test/tap", {
          fetch: mockFetch,
        })
          .jobs.from("job-123")
          .wait({ intervalMs: 0 }),
      ).rejects.toMatchObject({
        name: "TapJobTerminalError",
        status: { phase },
      });
    }
  });

  it("times out while waiting for a TAP async job", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "PENDING" });

    await expect(
      tap("https://example.test/tap", {
        fetch: mockFetch,
      })
        .jobs.from("job-123")
        .wait({ intervalMs: 0, timeoutMs: 0 }),
    ).rejects.toMatchObject({
      name: "TapJobTimeoutError",
      timeoutMs: 0,
      lastStatus: { phase: "PENDING" },
    });
  });

  it("honors abort signals while waiting for TAP async jobs", async () => {
    const controller = new AbortController();
    const mockFetch = createMockTapAsyncFetch({ phase: "PENDING" });
    controller.abort();

    await expect(
      tap("https://example.test/tap", {
        fetch: mockFetch,
      })
        .jobs.from("job-123")
        .wait({ intervalMs: 0, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("supports backoff while waiting for TAP async jobs", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phases: ["PENDING", "QUEUED", "EXECUTING", "COMPLETED"],
    });

    await expect(
      tap("https://example.test/tap", {
        fetch: mockFetch,
      })
        .jobs.from("job-123")
        .wait({ intervalMs: 0, backoff: true, maxIntervalMs: 0 }),
    ).resolves.toMatchObject({ phase: "COMPLETED" });
    expect(mockFetch.requests).toHaveLength(4);
  });

  it("exports typed async wait errors", () => {
    expect(new TapJobTerminalError({ phase: "ERROR" })).toMatchObject({
      name: "TapJobTerminalError",
      status: { phase: "ERROR" },
    });
    expect(new TapJobTimeoutError(1000, { phase: "EXECUTING" })).toMatchObject({
      name: "TapJobTimeoutError",
      timeoutMs: 1000,
      lastStatus: { phase: "EXECUTING" },
    });
  });

  it("fetches a completed TAP async job result as a TapResult", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });

    const result = await tap("https://example.test/tap", {
      fetch: mockFetch,
    })
      .jobs.from("job-123")
      .fetch({ format: "votable" });

    await expect(result.text()).resolves.toContain("<TABLEDATA>");
    expect(result.format).toBe("votable");
    expect(result.contentType).toBe("application/x-votable+xml");
    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123/results/result",
    );
    expect(mockFetch.requests[0]?.method).toBe("GET");
  });

  it("uses the client default format when fetching a TAP async job result", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });

    const result = await tap("https://example.test/tap", {
      defaultFormat: "csv",
      fetch: mockFetch,
    })
      .jobs.from("job-123")
      .fetch();

    expect(result.format).toBe("csv");
  });

  it("fetches native CSV async job results as parseable rows", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phase: "COMPLETED",
      resultContentType: "text/csv",
      resultFixture: "native.csv",
    });

    const result = await tap("https://example.test/tap", {
      fetch: mockFetch,
    })
      .jobs.from("job-123")
      .fetch({ format: "csv" });

    expect(result.format).toBe("csv");
    await expect(result.json()).resolves.toEqual([
      { source_id: "1001", ra: "12.5", dec: "-45.25" },
      { source_id: "1002", ra: "13.5", dec: "-44.75" },
    ]);
  });

  it("infers native CSV async job results from content type", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phase: "COMPLETED",
      resultContentType: "text/csv",
      resultFixture: "native.csv",
    });

    const result = await tap("https://example.test/tap", {
      fetch: mockFetch,
    })
      .jobs.from("job-123")
      .fetch({ format: "votable" });

    expect(result.format).toBe("csv");
    await expect(result.json()).resolves.toEqual([
      { source_id: "1001", ra: "12.5", dec: "-45.25" },
      { source_id: "1002", ra: "13.5", dec: "-44.75" },
    ]);
  });

  it("does not add sync-only CDS compatibility parameters to async submissions", async () => {
    const mockFetch = createMockTapAsyncFetch();

    await tap("simbad", { fetch: mockFetch }).jobs.submit(
      "SELECT TOP 1 * FROM basic",
      {
        format: "votable",
      },
    );

    expect(mockFetch.requests[0]?.url.pathname).toBe("/simbad/sim-tap/async");
    expect(mockFetch.requests[0]?.params.has("REQUEST")).toBe(false);
    expect(mockFetch.requests[0]?.params.get("LANG")).toBe("ADQL");
    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT TOP 1 * FROM basic",
    );
  });

  it("maps async TAP result service errors to typed service errors", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phase: "COMPLETED",
      resultFixture: "sync-error.votable.xml",
    });

    await expect(
      tap("https://example.test/tap", {
        fetch: mockFetch,
      })
        .jobs.from("job-123")
        .fetch({ format: "votable" }),
    ).rejects.toThrow(TapServiceError);
  });

  it("deletes a TAP async job", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });
    const job = tap("https://example.test/tap", {
      fetch: mockFetch,
    }).jobs.from("job-123");

    await job.delete();

    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123",
    );
    expect(mockFetch.requests[0]?.method).toBe("DELETE");
    await expect(job.status()).rejects.toThrow(TapHttpError);
  });

  it("creates and starts a TAP async job", async () => {
    const mockFetch = createMockTapAsyncFetch();

    const job = await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).jobs.submit("SELECT TOP 2 source_id FROM mock_source", {
      format: "votable",
    });

    expect(job).toMatchObject({
      id: "job-123",
      url: "https://example.test/tap/async/job-123",
    });
    expect(job.status).toEqual(expect.any(Function));
    expect(job.fetch).toEqual(expect.any(Function));
    expect(job.delete).toEqual(expect.any(Function));
    expect(mockFetch.requests).toHaveLength(2);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async",
    );
    expect(mockFetch.requests[0]?.method).toBe("POST");
    expect(mockFetch.requests[0]?.redirect).toBe("manual");
    expect(mockFetch.requests[0]?.params.get("LANG")).toBe("ADQL");
    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT TOP 2 source_id FROM mock_source",
    );
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("votable");
    expect(mockFetch.requests[1]?.url.href).toBe(
      "https://example.test/tap/async/job-123/phase",
    );
    expect(mockFetch.requests[1]?.method).toBe("POST");
    expect(mockFetch.requests[1]?.redirect).toBe("manual");
    expect(mockFetch.requests[1]?.params.get("PHASE")).toBe("RUN");
  });

  it("sends explicit TAP request parameters when submitting async jobs", async () => {
    const mockFetch = createMockTapAsyncFetch();

    await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).jobs.submit("SELECT TOP 20 source_id FROM mock_source", {
      format: "votable",
      maxrec: 10,
      runId: "starfetch-async",
    });

    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async",
    );
    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT TOP 20 source_id FROM mock_source",
    );
    expect(mockFetch.requests[0]?.params.get("MAXREC")).toBe("10");
    expect(mockFetch.requests[0]?.params.get("RUNID")).toBe("starfetch-async");
    expect(mockFetch.requests[1]?.params.get("PHASE")).toBe("RUN");
    expect(mockFetch.requests[1]?.params.has("MAXREC")).toBe(false);
    expect(mockFetch.requests[1]?.params.has("RUNID")).toBe(false);
  });

  it("sends TAP upload parameters only when submitting async jobs", async () => {
    const mockFetch = createMockTapAsyncFetch();

    await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).jobs.submit("SELECT * FROM TAP_UPLOAD.targets", {
      format: "votable",
      uploads: [
        {
          tableName: "targets",
          uri: "https://example.test/targets.votable.xml",
        },
      ],
    });

    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT * FROM TAP_UPLOAD.targets",
    );
    expect(mockFetch.requests[0]?.params.get("UPLOAD")).toBe(
      "targets,https://example.test/targets.votable.xml",
    );
    expect(mockFetch.requests[1]?.params.get("PHASE")).toBe("RUN");
    expect(mockFetch.requests[1]?.params.has("UPLOAD")).toBe(false);
  });

  it("rejects malformed async uploads before contacting a TAP service", async () => {
    let fetchCalls = 0;
    const mockFetch: typeof fetch = async () => {
      fetchCalls += 1;
      return new Response("unused");
    };

    await expect(
      tap("https://example.test/tap", {
        fetch: mockFetch,
      }).jobs.submit("SELECT * FROM TAP_UPLOAD.bad", {
        format: "votable",
        uploads: [{ tableName: "bad.name", uri: "file:///tmp/bad.xml" }],
      }),
    ).rejects.toThrow(TapUploadError);

    expect(fetchCalls).toBe(0);
  });

  it("maps missing async job locations to a typed HTTP error", async () => {
    const mockFetch = async (): Promise<Response> =>
      new Response(null, { status: 303 });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).jobs.submit(
        "SELECT TOP 2 source_id FROM mock_source",
      ),
    ).rejects.toThrow(TapHttpError);
    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).jobs.submit(
        "SELECT TOP 2 source_id FROM mock_source",
      ),
    ).rejects.toThrow("did not return a job URL");
  });

  it("resolves relative async job locations against the job list URL", async () => {
    const mockFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);
      const url = new URL(request.url);

      if (url.pathname === "/tap/async") {
        return new Response(null, {
          status: 303,
          headers: { location: "job-123" },
        });
      }

      return new Response(null, {
        status: 303,
        headers: { location: "https://example.test/tap/async/job-123" },
      });
    };

    const job = await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).jobs.submit("SELECT TOP 2 source_id FROM mock_source");

    expect(job).toMatchObject({
      id: "job-123",
      url: "https://example.test/tap/async/job-123",
    });
  });

  it("rejects unsupported first-slice async formats before requesting TAP", async () => {
    const mockFetch = createMockTapAsyncFetch();

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).jobs.submit(
        "SELECT TOP 2 source_id FROM mock_source",
        { format: "json" as never },
      ),
    ).rejects.toThrow(TapFormatUnsupportedError);
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("maps async job start failures to typed HTTP errors", async () => {
    const mockFetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);
      const url = new URL(request.url);

      if (url.pathname.endsWith("/async")) {
        return new Response(null, {
          status: 303,
          headers: { location: "https://example.test/tap/async/job-123" },
        });
      }

      return new Response("phase failed", {
        status: 500,
        statusText: "Internal Server Error",
      });
    };

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).jobs.submit(
        "SELECT TOP 2 source_id FROM mock_source",
      ),
    ).rejects.toMatchObject({
      name: "TapHttpError",
      status: 500,
      statusText: "Internal Server Error",
    });
  });

  it("forwards submit abort signals to job creation and start requests", async () => {
    const controller = new AbortController();
    const mockFetch = createMockTapAsyncFetch();

    await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).jobs.submit("SELECT TOP 2 source_id FROM mock_source", {
      format: "votable",
      signal: controller.signal,
    });

    expect(mockFetch.requests[0]?.signal).toBe(controller.signal);
    expect(mockFetch.requests[1]?.signal).toBe(controller.signal);
  });

  it("forwards client user-agent to async submit, start, status, fetch, and delete requests", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });
    const client = tap("https://example.test/tap", {
      fetch: mockFetch,
      userAgent: "starfetch-test/0.1.0",
    });

    const job = await client.jobs.submit(
      "SELECT TOP 2 source_id FROM mock_source",
      {
        format: "votable",
      },
    );
    await job.status();
    await job.fetch({ format: "votable" });
    await job.delete();

    expect(mockFetch.requests.map((request) => request.userAgent)).toEqual([
      "starfetch-test/0.1.0",
      "starfetch-test/0.1.0",
      "starfetch-test/0.1.0",
      "starfetch-test/0.1.0",
      "starfetch-test/0.1.0",
    ]);
  });
});
