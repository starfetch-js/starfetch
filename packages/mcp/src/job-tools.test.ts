import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createMockTapAsyncFetch } from "../../core/test/mock-tap-async.js";
import {
  createStarfetchMcpServer,
  type StarfetchMcpServerOptions,
} from "./server.js";

describe("Starfetch MCP TAP async job tools", () => {
  it("submits TAP async jobs as structured MCP content", async () => {
    const mockFetch = createMockTapAsyncFetch();

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          maxrec: 5,
          query: "SELECT * FROM TAP_UPLOAD.targets",
          requestFormat: "votable",
          runId: "starfetch-mcp-async",
          uploads: [
            {
              filename: "targets.xml",
              tableName: "targets",
              votable: "<VOTABLE />",
            },
            {
              tableName: "remote",
              uri: "https://example.test/remote.votable.xml",
            },
          ],
          url: "https://example.test/tap",
        },
        name: "starfetch_tap_submit_job",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        data: {
          id: "job-123",
          url: "https://example.test/tap/async/job-123",
        },
        diagnostics: {
          effectiveMaxrec: 5,
          requestFormat: "votable",
          runId: "starfetch-mcp-async",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 2,
        },
      });
    });

    expect(mockFetch.requests).toHaveLength(2);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async",
    );
    expect(mockFetch.requests[0]?.method).toBe("POST");
    expect(mockFetch.requests[0]?.formData.get("QUERY")).toBe(
      "SELECT * FROM TAP_UPLOAD.targets",
    );
    expect(mockFetch.requests[0]?.formData.get("RESPONSEFORMAT")).toBe(
      "votable",
    );
    expect(mockFetch.requests[0]?.formData.get("MAXREC")).toBe("5");
    expect(mockFetch.requests[0]?.formData.get("RUNID")).toBe(
      "starfetch-mcp-async",
    );
    expect(mockFetch.requests[0]?.body).toContain(
      "targets,param:starfetch_upload_0",
    );
    expect(mockFetch.requests[0]?.body).toContain(
      "remote,https://example.test/remote.votable.xml",
    );
    expect(mockFetch.requests[1]?.url.href).toBe(
      "https://example.test/tap/async/job-123/phase",
    );
    expect(mockFetch.requests[1]?.params.get("PHASE")).toBe("RUN");
  });

  it("defaults async job MAXREC and omits RESPONSEFORMAT when requestFormat is omitted", async () => {
    const mockFetch = createMockTapAsyncFetch();

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          query: "SELECT TOP 2 source_id FROM mock_source",
          url: "https://example.test/tap",
        },
        name: "starfetch_tap_submit_job",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        data: {
          id: "job-123",
          url: "https://example.test/tap/async/job-123",
        },
        diagnostics: {
          effectiveMaxrec: 100,
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      });
    });

    expect(mockFetch.requests[0]?.params.has("RESPONSEFORMAT")).toBe(false);
    expect(mockFetch.requests[0]?.params.get("MAXREC")).toBe("100");
  });

  it("reads TAP async job status from an absolute job URL", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          jobIdOrUrl: "https://example.test/tap/async/job-123",
          url: "https://different.example.test/tap",
        },
        name: "starfetch_tap_job_status",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        data: {
          phase: "COMPLETED",
          resultUrl: "https://example.test/tap/async/job-123/results/result",
        },
        diagnostics: {
          job: {
            id: "job-123",
            url: "https://example.test/tap/async/job-123",
          },
          target: { baseUrl: "https://example.test/tap" },
        },
      });
    });

    expect(mockFetch.requests.map((request) => request.url.pathname)).toEqual([
      "/tap/async/job-123",
    ]);
  });

  it("waits for TAP async jobs with bounded MCP diagnostics", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phases: ["PENDING", "EXECUTING", "COMPLETED"],
    });

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          intervalMs: 0,
          jobIdOrUrl: "https://example.test/tap/async/job-123",
        },
        name: "starfetch_tap_job_wait",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        data: {
          phase: "COMPLETED",
          resultUrl: "https://example.test/tap/async/job-123/results/result",
        },
        diagnostics: {
          job: {
            id: "job-123",
            url: "https://example.test/tap/async/job-123",
          },
          observedPhases: ["PENDING", "EXECUTING", "COMPLETED"],
          target: { baseUrl: "https://example.test/tap" },
          timeoutMs: 120000,
        },
      });
    });

    expect(mockFetch.requests).toHaveLength(3);
  });

  it("maps TAP async terminal phases and timeouts to MCP errors", async () => {
    const terminalFetch = createMockTapAsyncFetch({ phase: "ERROR" });

    await withMcpClient({ fetch: terminalFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          intervalMs: 0,
          jobIdOrUrl: "https://example.test/tap/async/job-123",
        },
        name: "starfetch_tap_job_wait",
      });

      expect(result.isError).toBe(true);
      expect(firstTextContent(result)).toContain("TapJobTerminalError:");
    });

    const timeoutFetch = createMockTapAsyncFetch({ phase: "PENDING" });

    await withMcpClient({ fetch: timeoutFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          intervalMs: 0,
          jobIdOrUrl: "https://example.test/tap/async/job-123",
          timeoutMs: 0,
        },
        name: "starfetch_tap_job_wait",
      });

      expect(result.isError).toBe(true);
      expect(firstTextContent(result)).toContain("TapJobTimeoutError:");
    });
  });

  it("fetches TAP async job results as MCP structured content", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          format: "jsonl",
          jobIdOrUrl: "https://example.test/tap/async/job-123",
        },
        name: "starfetch_tap_job_fetch",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        data: {
          format: "jsonl",
        },
        diagnostics: {
          format: "jsonl",
          job: {
            id: "job-123",
            url: "https://example.test/tap/async/job-123",
          },
          requestFormat: "votable",
          sourceFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
        },
      });
      expect(
        (result.structuredContent as { data: { content: string } }).data
          .content,
      ).toContain('"source_id"');
    });

    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123/results/result",
    );
  });

  it("fetches native CSV async job results with an explicit source format", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phase: "COMPLETED",
      resultContentType: "text/csv",
      resultFixture: "native.csv",
    });

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          format: "jsonl",
          jobIdOrUrl: "https://example.test/tap/async/job-123",
          sourceFormat: "csv",
        },
        name: "starfetch_tap_job_fetch",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        data: {
          format: "jsonl",
        },
        diagnostics: {
          format: "jsonl",
          requestFormat: "votable",
          sourceFormat: "csv",
        },
      });
      expect(
        (result.structuredContent as { data: { content: string } }).data
          .content,
      ).toContain('"source_id"');
    });
  });

  it("infers native CSV async job result formats from content type", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phase: "COMPLETED",
      resultContentType: "text/csv",
      resultFixture: "native.csv",
    });

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          format: "jsonl",
          jobIdOrUrl: "https://example.test/tap/async/job-123",
        },
        name: "starfetch_tap_job_fetch",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        diagnostics: {
          requestFormat: "votable",
          sourceFormat: "csv",
        },
      });
    });
  });

  it("deletes TAP async jobs as an explicit MCP action", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          jobIdOrUrl: "job-123",
          url: "https://example.test/tap",
        },
        name: "starfetch_tap_job_delete",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        data: {
          deleted: true,
          id: "job-123",
          url: "https://example.test/tap/async/job-123",
        },
        diagnostics: {
          job: {
            id: "job-123",
            url: "https://example.test/tap/async/job-123",
          },
          target: { baseUrl: "https://example.test/tap" },
        },
      });
    });

    expect(mockFetch.requests[0]?.method).toBe("DELETE");
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123",
    );
  });

  it("rejects invalid TAP async job requests before contacting a TAP service", async () => {
    const mockFetch = createMockTapAsyncFetch();

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const missingTarget = await client.callTool({
        arguments: { jobIdOrUrl: "job-123" },
        name: "starfetch_tap_job_status",
      });
      expect(missingTarget.isError).toBe(true);
      expect(firstTextContent(missingTarget)).toContain("Invalid arguments");

      const invalidJobUrl = await client.callTool({
        arguments: { jobIdOrUrl: "https://example.test/tap/not-job" },
        name: "starfetch_tap_job_status",
      });
      expect(invalidJobUrl.isError).toBe(true);
      expect(firstTextContent(invalidJobUrl)).toContain(
        "Absolute TAP job URLs must end with /async/<job-id>.",
      );

      const relativePath = await client.callTool({
        arguments: {
          jobIdOrUrl: "async/job-123",
          url: "https://example.test/tap",
        },
        name: "starfetch_tap_job_status",
      });
      expect(relativePath.isError).toBe(true);
      expect(firstTextContent(relativePath)).toContain(
        "Relative TAP job references must be bare job ids.",
      );

      const invalidWait = await client.callTool({
        arguments: {
          jobIdOrUrl: "https://example.test/tap/async/job-123",
          timeoutMs: -1,
        },
        name: "starfetch_tap_job_wait",
      });
      expect(invalidWait.isError).toBe(true);
      expect(firstTextContent(invalidWait)).toContain("Invalid arguments");

      const invalidUpload = await client.callTool({
        arguments: {
          query: "SELECT * FROM TAP_UPLOAD.bad",
          uploads: [{ tableName: "bad.name", uri: "file:///tmp/bad.xml" }],
          url: "https://example.test/tap",
        },
        name: "starfetch_tap_submit_job",
      });
      expect(invalidUpload.isError).toBe(true);
      expect(firstTextContent(invalidUpload)).toContain("TapUploadError:");
    });

    expect(mockFetch.requests).toHaveLength(0);
  });
});

async function withMcpClient<T>(
  options: StarfetchMcpServerOptions,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const server = createStarfetchMcpServer(options);
  const client = new Client({
    name: "starfetch-mcp-test",
    version: "0.1.1",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    return await callback(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function firstTextContent(result: unknown): string {
  const { content } = result as { content: unknown };
  const [first] = content as Array<{ text?: unknown; type?: unknown }>;

  if (first?.type !== "text" || typeof first.text !== "string") {
    throw new Error("Expected first MCP content item to be text");
  }

  return first.text;
}
