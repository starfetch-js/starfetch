import { describe, expect, it } from "vitest";

import { createMockTapAsyncFetch, readCoreFixture } from "./mock-tap-async.js";

const uwsPhaseFixtures = [
  ["uws-job-pending.xml", "PENDING"],
  ["uws-job-queued.xml", "QUEUED"],
  ["uws-job-executing.xml", "EXECUTING"],
  ["uws-job-completed.xml", "COMPLETED"],
  ["uws-job-error.xml", "ERROR"],
  ["uws-job-aborted.xml", "ABORTED"],
  ["uws-job-archived.xml", "ARCHIVED"],
] as const;

describe("core TAP async UWS fixtures", () => {
  it("includes UWS job documents for the standard TAP async phases", async () => {
    for (const [fixtureName, phase] of uwsPhaseFixtures) {
      const fixture = await readCoreFixture(fixtureName);

      expect(fixture).toContain("<uws:job");
      expect(fixture).toContain(`<uws:phase>${phase}</uws:phase>`);
    }
  });

  it("includes completed result links and error detail links", async () => {
    const completed = await readCoreFixture("uws-job-completed.xml");
    const failed = await readCoreFixture("uws-job-error.xml");

    expect(completed).toContain('<uws:result id="result"');
    expect(completed).toContain("/async/job-123/results/result");
    expect(failed).toContain('<uws:errorSummary type="fatal"');
    expect(failed).toContain(
      "<uws:message>ADQL execution failed</uws:message>",
    );
    expect(await readCoreFixture("uws-error-detail.txt")).toContain(
      "Column mock_source.missing_column does not exist",
    );
  });

  it("includes a TAP result document for async result fetching", async () => {
    const result = await readCoreFixture("uws-result.votable.xml");

    expect(result).toContain('<INFO name="QUERY_STATUS" value="OK">');
    expect(result).toContain("<TABLEDATA>");
  });
});

describe("createMockTapAsyncFetch", () => {
  it("captures TAP /async job creation form parameters and returns a job location", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const body = new URLSearchParams({
      LANG: "ADQL",
      QUERY: "SELECT TOP 2 source_id FROM mock_source",
      RESPONSEFORMAT: "votable",
    });

    const response = await mockFetch("https://example.test/tap/async", {
      method: "POST",
      body,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://example.test/tap/async/job-123",
    );
    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.method).toBe("POST");
    expect(mockFetch.requests[0]?.params.get("LANG")).toBe("ADQL");
    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT TOP 2 source_id FROM mock_source",
    );
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("votable");
  });

  it("mocks job status, phase, result, and error endpoints", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phase: "COMPLETED",
    });

    const job = await mockFetch("https://example.test/tap/async/job-123");
    const phase = await mockFetch(
      "https://example.test/tap/async/job-123/phase",
    );
    const result = await mockFetch(
      "https://example.test/tap/async/job-123/results/result",
    );
    const error = await mockFetch(
      "https://example.test/tap/async/job-123/error",
    );

    await expect(job.text()).resolves.toContain(
      "<uws:phase>COMPLETED</uws:phase>",
    );
    await expect(phase.text()).resolves.toBe("COMPLETED");
    await expect(result.text()).resolves.toContain("<TABLEDATA>");
    await expect(error.text()).resolves.toContain(
      "Column mock_source.missing_column does not exist",
    );
  });

  it("advances configured job status phases", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phases: ["PENDING", "EXECUTING", "COMPLETED"],
    });

    const first = await mockFetch("https://example.test/tap/async/job-123");
    const second = await mockFetch("https://example.test/tap/async/job-123");
    const third = await mockFetch("https://example.test/tap/async/job-123");

    await expect(first.text()).resolves.toContain(
      "<uws:phase>PENDING</uws:phase>",
    );
    await expect(second.text()).resolves.toContain(
      "<uws:phase>EXECUTING</uws:phase>",
    );
    await expect(third.text()).resolves.toContain(
      "<uws:phase>COMPLETED</uws:phase>",
    );
  });

  it("captures phase changes and deletion behavior", async () => {
    const mockFetch = createMockTapAsyncFetch();

    const phaseResponse = await mockFetch(
      "https://example.test/tap/async/job-123/phase",
      {
        method: "POST",
        body: new URLSearchParams({ PHASE: "RUN" }),
      },
    );

    expect(phaseResponse.status).toBe(303);
    expect(mockFetch.requests[0]?.params.get("PHASE")).toBe("RUN");

    const deleteResponse = await mockFetch(
      "https://example.test/tap/async/job-123",
      { method: "DELETE" },
    );

    expect(deleteResponse.status).toBe(303);
    await expect(
      mockFetch("https://example.test/tap/async/job-123"),
    ).resolves.toMatchObject({ status: 404 });
  });

  it("rejects invalid phase changes", async () => {
    const mockFetch = createMockTapAsyncFetch();

    await expect(
      mockFetch("https://example.test/tap/async/job-123/phase", {
        method: "POST",
        body: new URLSearchParams({ PHASE: "START" }),
      }),
    ).rejects.toThrow("Expected TAP async phase change");

    await expect(
      mockFetch("https://example.test/tap/async/job-123/phase", {
        method: "POST",
      }),
    ).rejects.toThrow("missing PHASE");
  });

  it("rejects unexpected TAP async paths and methods", async () => {
    const mockFetch = createMockTapAsyncFetch();

    await expect(
      mockFetch("https://example.test/tap/sync", { method: "POST" }),
    ).rejects.toThrow("Expected TAP /async request");

    await expect(
      mockFetch("https://example.test/tap/async/job-123/results/result", {
        method: "POST",
      }),
    ).rejects.toThrow("Expected TAP async GET");
  });
});
