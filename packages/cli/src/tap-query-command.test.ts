import { randomUUID } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createMockTapSyncFetch,
  readCoreFixture,
} from "../../core/test/mock-tap-sync.js";
import { createStringInput } from "../test/string-input.js";
import { createStringWriter } from "../test/string-writer.js";
import { runCli } from "./index.js";

describe("starfetch CLI TAP query", () => {
  it("prints command help for tap query --help", async () => {
    const stdout = createStringWriter();

    expect(
      await runCli(["tap", "query", "--help"], { stdout: stdout.writer }),
    ).toBe(0);
    expect(stdout.text()).toContain("--url <tap-url>");
    expect(stdout.text()).toContain("--service <name>");
    expect(stdout.text()).toContain("--query <adql>");
    expect(stdout.text()).toContain("--file <path>");
    expect(stdout.text()).toContain("--format <format>");
    expect(stdout.text()).toContain("--upload <table=path>");
    expect(stdout.text()).toContain("--upload-url <table=uri>");
  });

  it("returns a usage error for missing query input", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));
    const stderr = createStringWriter();

    const exitCode = await runCli(
      ["tap", "query", "--url", "https://example.test/tap", "--format", "csv"],
      {
        fetch: mockFetch,
        stderr: stderr.writer,
      },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain(
      "Provide ADQL with --query, --file, or stdin.",
    );
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("requires either --url or --service before making a request", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));
    const stderr = createStringWriter();

    const exitCode = await runCli(
      ["tap", "query", "--query", "SELECT 1", "--format", "csv"],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain("Specify --url or --service.");
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("writes query results to stdout by default", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT TOP 2 * FROM mock_source",
        "--format",
        "csv",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toBe(fixture);
    expect(stderr.text()).toBe("");
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("csv");
  });

  it("sends explicit TAP request parameters for sync queries", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));
    const stdout = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT TOP 20 * FROM mock_source",
        "--format",
        "csv",
        "--maxrec",
        "10",
        "--run-id",
        "starfetch-cli-sync",
      ],
      { fetch: mockFetch, stdout: stdout.writer },
    );

    expect(exitCode).toBe(0);
    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT TOP 20 * FROM mock_source",
    );
    expect(mockFetch.requests[0]?.params.get("MAXREC")).toBe("10");
    expect(mockFetch.requests[0]?.params.get("RUNID")).toBe(
      "starfetch-cli-sync",
    );
  });

  it("sends local and URI TAP uploads for sync queries", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));
    const stdout = createStringWriter();
    const uploadPath = join(tmpdir(), `starfetch-${randomUUID()}.xml`);

    try {
      await writeFile(uploadPath, "<VOTABLE />", "utf8");

      const exitCode = await runCli(
        [
          "tap",
          "query",
          "--url",
          "https://example.test/tap",
          "--query",
          "SELECT * FROM TAP_UPLOAD.targets",
          "--format",
          "votable",
          "--upload",
          `targets=${uploadPath}`,
          "--upload-url",
          "remote=https://example.test/remote.votable.xml",
        ],
        { fetch: mockFetch, stdout: stdout.writer },
      );

      expect(exitCode).toBe(0);
      expect(mockFetch.requests[0]?.formData.get("QUERY")).toBe(
        "SELECT * FROM TAP_UPLOAD.targets",
      );
      expect(mockFetch.requests[0]?.formData.get("starfetch_upload_0")).toBe(
        "<VOTABLE />",
      );
      expect(mockFetch.requests[0]?.body).toContain(
        "targets,param:starfetch_upload_0",
      );
      expect(mockFetch.requests[0]?.body).toContain(
        "remote,https://example.test/remote.votable.xml",
      );
    } finally {
      await unlink(uploadPath).catch(() => undefined);
    }
  });

  it("rejects invalid sync upload descriptors before making a request", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT 1",
        "--format",
        "csv",
        "--upload-url",
        "bad.name=https://example.test/targets.xml",
      ],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain("Invalid TAP upload table name");
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("rejects invalid sync query MAXREC values before making a request", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT 1",
        "--format",
        "csv",
        "--maxrec",
        "-1",
      ],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain(
      "--maxrec must be a non-negative safe integer.",
    );
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("reads query input from --file", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));
    const stdout = createStringWriter();
    const queryPath = join(tmpdir(), `starfetch-${randomUUID()}.sql`);

    try {
      await writeFile(queryPath, "SELECT TOP 3 * FROM file_source\n", "utf8");

      const exitCode = await runCli(
        [
          "tap",
          "query",
          "--url",
          "https://example.test/tap",
          "--file",
          queryPath,
          "--format",
          "csv",
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

  it("reads query input from stdin", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));
    const stdout = createStringWriter();

    const exitCode = await runCli(
      ["tap", "query", "--url", "https://example.test/tap", "--format", "csv"],
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

  it("prefers --query over --file and stdin", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));
    const stdout = createStringWriter();
    const queryPath = join(tmpdir(), `starfetch-${randomUUID()}.sql`);

    try {
      await writeFile(queryPath, "SELECT * FROM file_source", "utf8");

      const exitCode = await runCli(
        [
          "tap",
          "query",
          "--url",
          "https://example.test/tap",
          "--query",
          "SELECT * FROM flag_source",
          "--file",
          queryPath,
          "--format",
          "csv",
        ],
        {
          fetch: mockFetch,
          stdout: stdout.writer,
          stdin: createStringInput("SELECT * FROM stdin_source"),
        },
      );

      expect(exitCode).toBe(0);
      expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
        "SELECT * FROM flag_source",
      );
    } finally {
      await unlink(queryPath).catch(() => undefined);
    }
  });

  it("prefers --file over stdin", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));
    const stdout = createStringWriter();
    const queryPath = join(tmpdir(), `starfetch-${randomUUID()}.sql`);

    try {
      await writeFile(queryPath, "SELECT * FROM file_source", "utf8");

      const exitCode = await runCli(
        [
          "tap",
          "query",
          "--url",
          "https://example.test/tap",
          "--file",
          queryPath,
          "--format",
          "csv",
        ],
        {
          fetch: mockFetch,
          stdout: stdout.writer,
          stdin: createStringInput("SELECT * FROM stdin_source"),
        },
      );

      expect(exitCode).toBe(0);
      expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
        "SELECT * FROM file_source",
      );
    } finally {
      await unlink(queryPath).catch(() => undefined);
    }
  });

  it("targets a known service preset", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));
    const stdout = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--service",
        "simbad",
        "--query",
        "SELECT TOP 2 * FROM mock_source",
        "--format",
        "csv",
      ],
      { fetch: mockFetch, stdout: stdout.writer },
    );

    expect(exitCode).toBe(0);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://simbad.cds.unistra.fr/simbad/sim-tap/sync",
    );
  });

  it("uses --url as the endpoint when --service is also supplied", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));
    const stdout = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--service",
        "gaia",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT TOP 2 * FROM mock_source",
        "--format",
        "csv",
      ],
      { fetch: mockFetch, stdout: stdout.writer },
    );

    expect(exitCode).toBe(0);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/sync",
    );
  });

  it("rejects unknown service presets without making a request", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--service",
        "unknown",
        "--query",
        "SELECT 1",
        "--format",
        "csv",
      ],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain("Unknown TAP service preset: unknown");
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("rejects unknown service presets even when --url is supplied", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--service",
        "unknown",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT 1",
        "--format",
        "csv",
      ],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain("Unknown TAP service preset: unknown");
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("converts VOTable query results to JSON on stdout", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT TOP 2 * FROM mock_source",
        "--format",
        "json",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toBe(
      `${JSON.stringify(
        [
          { source_id: "1001", ra: "12.5", dec: "-45.25" },
          { source_id: "1002", ra: "13.5", dec: "-44.75" },
        ],
        null,
        2,
      )}\n`,
    );
    expect(stderr.text()).toBe("");
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("votable");
  });

  it("converts VOTable query results to JSONL with --out", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );
    const stdout = createStringWriter();
    const stderr = createStringWriter();
    const outputPath = join(tmpdir(), `starfetch-${randomUUID()}.jsonl`);

    try {
      const exitCode = await runCli(
        [
          "tap",
          "query",
          "--url",
          "https://example.test/tap",
          "--query",
          "SELECT TOP 2 * FROM mock_source",
          "--format",
          "jsonl",
          "--out",
          outputPath,
        ],
        { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
      );

      expect(exitCode).toBe(0);
      expect(stdout.text()).toBe("");
      expect(stderr.text()).toBe("");
      await expect(readFile(outputPath, "utf8")).resolves.toBe(
        [
          '{"source_id":"1001","ra":"12.5","dec":"-45.25"}',
          '{"source_id":"1002","ra":"13.5","dec":"-44.75"}',
          "",
        ].join("\n"),
      );
      expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe(
        "votable",
      );
    } finally {
      await unlink(outputPath).catch(() => undefined);
    }
  });

  it("converts VOTable query results returned for native tabular requests", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT TOP 2 * FROM mock_source",
        "--format",
        "csv",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(0);
    expect(stdout.text()).toBe(
      ["source_id,ra,dec", "1001,12.5,-45.25", "1002,13.5,-44.75", ""].join(
        "\n",
      ),
    );
    expect(stderr.text()).toBe("");
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("csv");
  });

  it("writes query results to --out without writing data to stdout", async () => {
    const fixture = await readCoreFixture("native.tsv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));
    const stdout = createStringWriter();
    const stderr = createStringWriter();
    const outputPath = join(tmpdir(), `starfetch-${randomUUID()}.tsv`);

    try {
      const exitCode = await runCli(
        [
          "tap",
          "query",
          "--url",
          "https://example.test/tap",
          "--query",
          "SELECT TOP 2 * FROM mock_source",
          "--format",
          "tsv",
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

  it("rejects unsupported formats without making a request", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT 1",
        "--format",
        "fits",
      ],
      { fetch: mockFetch, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stderr.text()).toContain("Unsupported format: fits");
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("returns a non-zero exit for TAP service errors", async () => {
    const mockFetch = createMockTapSyncFetch(
      new Response(await readCoreFixture("sync-error.votable.xml"), {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );
    const stdout = createStringWriter();
    const stderr = createStringWriter();

    const exitCode = await runCli(
      [
        "tap",
        "query",
        "--url",
        "https://example.test/tap",
        "--query",
        "SELECT FROM",
        "--format",
        "votable",
      ],
      { fetch: mockFetch, stdout: stdout.writer, stderr: stderr.writer },
    );

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toContain("Syntax error near FROM");
  });
});
