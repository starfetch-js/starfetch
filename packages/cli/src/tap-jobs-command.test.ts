import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createMockTapAsyncFetch,
  readCoreFixture,
} from "../../core/test/mock-tap-async.js";
import { createStringInput } from "../test/string-input.js";
import { createStringWriter } from "../test/string-writer.js";
import { runCli } from "./index.js";

describe("starfetch CLI TAP async jobs", () => {
  it("prints command help for tap jobs --help", async () => {
    const stdout = createStringWriter();

    expect(
      await runCli(["tap", "jobs", "--help"], { stdout: stdout.writer }),
    ).toBe(0);
    expect(stdout.text()).toContain("submit");
    expect(stdout.text()).toContain("status");
    expect(stdout.text()).toContain("wait");
    expect(stdout.text()).toContain("fetch");
    expect(stdout.text()).toContain("delete");
  });

  it("prints command help for tap jobs fetch --help", async () => {
    const stdout = createStringWriter();

    expect(
      await runCli(["tap", "jobs", "fetch", "--help"], {
        stdout: stdout.writer,
      }),
    ).toBe(0);
    expect(stdout.text()).toContain("--format <format>");
    expect(stdout.text()).toContain("--source-format <format>");
  });

  it("submits an async TAP job and prints the job URL", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "submit",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT TOP 2 * FROM mock_source",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toBe("https://example.test/tap/async/job-123\n");
    expect(stderr.text()).toBe("");
    expect(mockFetch.requests).toHaveLength(2);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async",
    );
    expect(mockFetch.requests[0]?.params.get("LANG")).toBe("ADQL");
    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT TOP 2 * FROM mock_source",
    );
    expect(mockFetch.requests[1]?.url.href).toBe(
      "https://example.test/tap/async/job-123/phase",
    );
    expect(mockFetch.requests[1]?.params.get("PHASE")).toBe("RUN");
  });

  it("sends explicit TAP request parameters when submitting async jobs", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stdout = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "submit",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT TOP 20 * FROM mock_source",
        "--maxrec",
        "10",
        "--run-id",
        "starfetch-cli-async",
      ],
      { fetch: mockFetch, stdout: stdout.writer },
    );

    expect(exitCode).toBe(0);
    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT TOP 20 * FROM mock_source",
    );
    expect(mockFetch.requests[0]?.params.get("MAXREC")).toBe("10");
    expect(mockFetch.requests[0]?.params.get("RUNID")).toBe(
      "starfetch-cli-async",
    );
    expect(mockFetch.requests[1]?.params.get("PHASE")).toBe("RUN");
    expect(mockFetch.requests[1]?.params.has("MAXREC")).toBe(false);
    expect(mockFetch.requests[1]?.params.has("RUNID")).toBe(false);
  });

  it("sends URI TAP uploads when submitting async jobs", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stdout = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "submit",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT * FROM TAP_UPLOAD.targets",
        "--upload-url",
        "targets=https://example.test/targets.votable.xml",
      ],
      { fetch: mockFetch, stdout: stdout.writer },
    );

    expect(exitCode).toBe(0);
    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT * FROM TAP_UPLOAD.targets",
    );
    expect(mockFetch.requests[0]?.params.get("UPLOAD")).toBe(
      "targets,https://example.test/targets.votable.xml",
    );
    expect(mockFetch.requests[1]?.params.get("PHASE")).toBe("RUN");
    expect(mockFetch.requests[1]?.params.has("UPLOAD")).toBe(false);
  });

  it("rejects invalid async submit MAXREC values before making a request", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "submit",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT 1",
        "--maxrec",
        "1.5",
      ],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain(
      "--maxrec must be a non-negative safe integer.",
    );
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("submits an async TAP job with query input from --file", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stdout = createStringWriter();
    const queryPath = join(tmpdir(), `starfetch-${randomUUID()}.sql`);

    try {
      await writeFile(queryPath, "SELECT TOP 3 * FROM file_source\n", "utf8");

      const exitCode = await runCli(
        [
          "tap",
          "jobs",
          "submit",
          "--url",
          "https://example.test/tap",
          "--file",
          queryPath,
        ],
        { fetch: mockFetch, stdout: stdout.writer },
      );

      expect(exitCode).toBe(0);
      expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
        "SELECT TOP 3 * FROM file_source\n",
      );
    } finally {
      await unlink(queryPath).catch(() => undefined);
    }
  });

  it("submits an async TAP job with query input from stdin", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stdout = createStringWriter();

    const exitCode = await runCli(
      ["tap", "jobs", "submit", "--url", "https://example.test/tap"],
      {
        fetch: mockFetch,
        stdout: stdout.writer,
        stdin: createStringInput("SELECT TOP 4 * FROM stdin_source"),
      },
    );

    expect(exitCode).toBe(0);
    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT TOP 4 * FROM stdin_source",
    );
  });

  it("targets a known service preset for async TAP jobs", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stdout = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "submit",
        "--service",
        "exoplanetarchive",
        "--query",
        "SELECT TOP 2 * FROM mock_source",
      ],
      { fetch: mockFetch, stdout: stdout.writer },
    );

    expect(exitCode).toBe(0);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://exoplanetarchive.ipac.caltech.edu/TAP/async",
    );
  });

  it("uses --url as the endpoint when --service is also supplied", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });
    const stdout = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "status",
        "--service",
        "gaia",
        "--url",
        "https://example.test/tap",
        "job-123",
      ],
      { fetch: mockFetch, stdout: stdout.writer },
    );

    expect(exitCode).toBe(0);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123",
    );
  });

  it("requires either --url or --service before making a request", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      ["tap", "jobs", "submit", "--query", "SELECT 1"],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain("Specify --url or --service.");
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("returns a usage error for missing async submit query input", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      ["tap", "jobs", "submit", "--url", "https://example.test/tap"],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain(
      "Provide ADQL with --query, --file, or stdin.",
    );
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("rejects unknown service presets without making a request", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      ["tap", "jobs", "submit", "--service", "unknown", "--query", "SELECT 1"],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain("Unknown TAP service preset: unknown");
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("prints async TAP job status", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      ["tap", "jobs", "status", "--url", "https://example.test/tap", "job-123"],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toContain("phase: COMPLETED\n");
    expect(stdout.text()).toContain(
      "result: https://example.test/tap/async/job-123/results/result\n",
    );
    expect(stderr.text()).toBe("");
    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.method).toBe("GET");
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123",
    );
  });

  it("reuses a full async job URL without separate target flags", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      ["tap", "jobs", "status", "https://example.test/tap/async/job-123"],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toContain("phase: COMPLETED\n");
    expect(stderr.text()).toBe("");
    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123",
    );
  });

  it("waits for an async TAP job and prints progress to stderr", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phases: ["PENDING", "EXECUTING", "COMPLETED"],
    });
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "wait",
        "--url",
        "https://example.test/tap",
        "--interval",
        "0",
        "job-123",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toContain("phase: COMPLETED\n");
    expect(stdout.text()).toContain(
      "result: https://example.test/tap/async/job-123/results/result\n",
    );
    expect(stderr.text()).toBe(
      ["phase: PENDING", "phase: EXECUTING", "phase: COMPLETED", ""].join("\n"),
    );
    expect(mockFetch.requests).toHaveLength(3);
  });

  it("returns an error when waiting for an async TAP job times out", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "PENDING" });
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "wait",
        "--url",
        "https://example.test/tap",
        "--interval",
        "0",
        "--timeout",
        "0",
        "job-123",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toContain("phase: PENDING\n");
    expect(stderr.text()).toContain("TAP async job wait timed out after 0ms");
    expect(mockFetch.requests).toHaveLength(1);
  });

  it("returns an error for terminal failed async TAP job phases", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "ERROR" });
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "wait",
        "--url",
        "https://example.test/tap",
        "--interval",
        "0",
        "job-123",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toContain("phase: ERROR\n");
    expect(stderr.text()).toContain(
      "TAP async job reached terminal phase ERROR",
    );
    expect(mockFetch.requests).toHaveLength(1);
  });

  it("rejects invalid async wait options before making a request", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "wait",
        "--url",
        "https://example.test/tap",
        "--interval",
        "1.5",
        "job-123",
      ],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain(
      "Wait values must be non-negative safe integers.",
    );
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("fetches async TAP job results to stdout", async () => {
    const fixture = await readCoreFixture("uws-result.votable.xml");
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "fetch",
        "--url",
        "https://example.test/tap",
        "job-123",
        "--format",
        "votable",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toBe(fixture);
    expect(stderr.text()).toBe("");
    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123/results/result",
    );
  });

  it("converts async TAP job results to JSONL", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "fetch",
        "--url",
        "https://example.test/tap",
        "job-123",
        "--format",
        "jsonl",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toBe(
      [
        '{"source_id":"1001","ra":"12.3","dec":"-45.6"}',
        '{"source_id":"1002","ra":"98.7","dec":"10.1"}',
        "",
      ].join("\n"),
    );
    expect(stderr.text()).toBe("");
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123/results/result",
    );
  });

  it("converts async TAP job results to JSON", async () => {
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "fetch",
        "--url",
        "https://example.test/tap",
        "job-123",
        "--format",
        "json",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.text())).toEqual([
      { source_id: "1001", ra: "12.3", dec: "-45.6" },
      { source_id: "1002", ra: "98.7", dec: "10.1" },
    ]);
    expect(stderr.text()).toBe("");
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123/results/result",
    );
  });

  it("converts native CSV async TAP job results with an explicit source format", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phase: "COMPLETED",
      resultContentType: "text/csv",
      resultFixture: "native.csv",
    });
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "fetch",
        "--url",
        "https://example.test/tap",
        "job-123",
        "--format",
        "jsonl",
        "--source-format",
        "csv",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toBe(
      [
        '{"source_id":"1001","ra":"12.5","dec":"-45.25"}',
        '{"source_id":"1002","ra":"13.5","dec":"-44.75"}',
        "",
      ].join("\n"),
    );
    expect(stderr.text()).toBe("");
  });

  it("infers native CSV async TAP job result formats from content type", async () => {
    const mockFetch = createMockTapAsyncFetch({
      phase: "COMPLETED",
      resultContentType: "text/csv",
      resultFixture: "native.csv",
    });
    const stdout = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "fetch",
        "--url",
        "https://example.test/tap",
        "job-123",
        "--format",
        "jsonl",
      ],
      { fetch: mockFetch, stdout: stdout.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toContain('"source_id"');
  });

  it("fetches async TAP job results to --out without writing data to stdout", async () => {
    const fixture = await readCoreFixture("uws-result.votable.xml");
    const mockFetch = createMockTapAsyncFetch({ phase: "COMPLETED" });
    const stdout = createStringWriter();
    const stderr = createStringWriter();
    const outputPath = join(tmpdir(), `starfetch-${randomUUID()}.xml`);

    try {
      const exitCode = await runCli(
        [
          "tap",
          "jobs",
          "fetch",
          "--url",
          "https://example.test/tap",
          "job-123",
          "--format",
          "votable",
          "--out",
          outputPath,
        ],
        { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
      );

      expect(exitCode).toBe(0);
      expect(stdout.text()).toBe("");
      expect(stderr.text()).toBe("");
      await expect(readFile(outputPath, "utf8")).resolves.toBe(fixture);
    } finally {
      await unlink(outputPath).catch(() => undefined);
    }
  });

  it("deletes an async TAP job", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      ["tap", "jobs", "delete", "--url", "https://example.test/tap", "job-123"],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toBe("");
    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.method).toBe("DELETE");
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/async/job-123",
    );
  });

  it("rejects unsupported async fetch formats without making a request", async () => {
    const mockFetch = createMockTapAsyncFetch();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "jobs",
        "fetch",
        "--url",
        "https://example.test/tap",
        "job-123",
        "--format",
        "fits",
      ],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain("Unsupported format: fits");
    expect(mockFetch.requests).toHaveLength(0);
  });
});
