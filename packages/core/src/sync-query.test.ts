import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertSupportedSyncFormat,
  type TapSyncFormat,
  TapAuthUnsupportedError,
  TapFormatUnsupportedError,
  TapHttpError,
  TapServiceError,
  TapUploadError,
  tap,
} from "./index.js";
import {
  createMockTapSyncFetch,
  readCoreFixture,
} from "../test/mock-tap-sync.js";

describe("TAP sync query", () => {
  it("posts ADQL to the TAP /sync endpoint and returns CSV text", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "text/csv" },
      }),
    );

    const result = await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).query("SELECT TOP 2 source_id, ra, dec FROM mock_source", {
      format: "csv",
    });

    expect(result.format).toBe("csv");
    expect(await result.text()).toBe(fixture);
    expect(await result.text()).toBe(fixture);
    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/sync",
    );
    expect(mockFetch.requests[0]?.params.get("LANG")).toBe("ADQL");
    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT TOP 2 source_id, ra, dec FROM mock_source",
    );
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("csv");
  });

  it("passes through native TSV and VOTable results", async () => {
    const cases = [
      ["tsv", "native.tsv", "text/tab-separated-values"],
      [
        "votable",
        "sync-success-tabledata.votable.xml",
        "application/x-votable+xml",
      ],
    ] as const;

    for (const [format, fixtureName, contentType] of cases) {
      const fixture = await readCoreFixture(fixtureName);
      const mockFetch = createMockTapSyncFetch(
        new Response(fixture, {
          headers: { "content-type": contentType },
        }),
      );

      const result = await tap("https://example.test/tap", {
        fetch: mockFetch,
      }).query("SELECT TOP 2 * FROM mock_source", { format });

      expect(await result.text()).toBe(fixture);
      expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe(format);
    }
  });

  it("uses the client default format when query options omit format", async () => {
    const fixture = await readCoreFixture("native.tsv");
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "text/tab-separated-values" },
      }),
    );

    const result = await tap("https://example.test/tap", {
      defaultFormat: "tsv",
      fetch: mockFetch,
    }).query("SELECT TOP 2 * FROM mock_source");

    expect(result.format).toBe("tsv");
    expect(await result.text()).toBe(fixture);
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("tsv");
  });

  it("sends explicit TAP request parameters with sync queries", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));

    await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).query("SELECT TOP 20 * FROM mock_source", {
      format: "csv",
      maxrec: 10,
      runId: "starfetch-sync",
    });

    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT TOP 20 * FROM mock_source",
    );
    expect(mockFetch.requests[0]?.params.get("MAXREC")).toBe("10");
    expect(mockFetch.requests[0]?.params.get("RUNID")).toBe("starfetch-sync");
  });

  it("adds CDS preset sync compatibility parameters only for affected presets", async () => {
    const fixture = await readCoreFixture("native.csv");

    for (const service of ["simbad", "vizier"] as const) {
      const mockFetch = createMockTapSyncFetch(new Response(fixture));

      await tap(service, { fetch: mockFetch }).query(
        "SELECT TOP 1 * FROM mock_source",
        {
          format: "csv",
        },
      );

      expect(mockFetch.requests[0]?.params.get("REQUEST")).toBe("doQuery");
    }

    const directFetch = createMockTapSyncFetch(new Response(fixture));

    await tap("https://example.test/tap", { fetch: directFetch }).query(
      "SELECT TOP 1 * FROM mock_source",
      {
        format: "csv",
      },
    );

    expect(directFetch.requests[0]?.params.has("REQUEST")).toBe(false);
  });

  it("does not inherit preset sync compatibility parameters when url overrides service", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture));

    await tap(
      { service: "simbad", url: "https://example.test/tap" },
      { fetch: mockFetch },
    ).query("SELECT TOP 1 * FROM mock_source", {
      format: "csv",
    });

    expect(mockFetch.requests[0]?.params.has("REQUEST")).toBe(false);
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("csv");
  });

  it("sends TAP upload parameters with sync queries", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).query("SELECT * FROM TAP_UPLOAD.targets", {
      format: "votable",
      uploads: [
        {
          tableName: "targets",
          votable: "<VOTABLE />",
          filename: "targets.xml",
        },
      ],
    });

    expect(mockFetch.requests[0]?.contentType).toContain("multipart/form-data");
    expect(mockFetch.requests[0]?.formData.get("QUERY")).toBe(
      "SELECT * FROM TAP_UPLOAD.targets",
    );
    expect(mockFetch.requests[0]?.formData.get("UPLOAD")).toBe(
      "targets,param:starfetch_upload_0",
    );
    expect(mockFetch.requests[0]?.formData.get("starfetch_upload_0")).toBe(
      "<VOTABLE />",
    );
  });

  it("rejects malformed sync uploads before contacting a TAP service", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));

    await expect(
      tap("https://example.test/tap", {
        fetch: mockFetch,
      }).query("SELECT * FROM TAP_UPLOAD.bad", {
        format: "votable",
        uploads: [{ tableName: "bad.name", uri: "file:///tmp/bad.xml" }],
      }),
    ).rejects.toThrow(TapUploadError);

    expect(mockFetch.allRequests).toHaveLength(0);
  });

  it("forwards query abort signals to the TAP request", async () => {
    const fixture = await readCoreFixture("native.csv");
    const controller = new AbortController();
    const mockFetch = createMockTapSyncFetch(new Response(fixture));

    await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).query("SELECT TOP 2 * FROM mock_source", {
      format: "csv",
      signal: controller.signal,
    });

    expect(mockFetch.requests[0]?.signal).toBe(controller.signal);
  });

  it("forwards client user-agent to capabilities and sync query requests", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(new Response(fixture), {
      capabilities: "vosi-capabilities-anonymous.xml",
    });

    await tap("https://example.test/tap", {
      fetch: mockFetch,
      userAgent: "starfetch-test/0.1.0",
    }).query("SELECT TOP 2 * FROM mock_source", {
      format: "csv",
    });

    expect(mockFetch.allRequests.map((request) => request.userAgent)).toEqual([
      "starfetch-test/0.1.0",
      "starfetch-test/0.1.0",
    ]);
  });

  it("exposes pass-through text, bytes, response, and save helpers", async () => {
    const cases = [
      ["csv", "native.csv", "text/csv"],
      ["tsv", "native.tsv", "text/tab-separated-values"],
      [
        "votable",
        "sync-success-tabledata.votable.xml",
        "application/x-votable+xml",
      ],
    ] as const;

    for (const [format, fixtureName, contentType] of cases) {
      const fixture = await readCoreFixture(fixtureName);
      const mockFetch = createMockTapSyncFetch(
        new Response(fixture, {
          headers: { "content-type": contentType },
        }),
      );
      const result = await tap("https://example.test/tap", {
        fetch: mockFetch,
      }).query("SELECT TOP 2 * FROM mock_source", { format });
      const outputDir = await mkdtemp(join(tmpdir(), "starfetch-result-"));
      const outputPath = join(outputDir, `result.${format}`);

      try {
        expect(result.format).toBe(format);
        expect(result.contentType).toBe(contentType);
        expect(await result.text()).toBe(fixture);
        expect(new TextDecoder().decode(await result.arrayBuffer())).toBe(
          fixture,
        );

        const response = result.response();
        expect(response.headers.get("content-type")).toBe(contentType);
        expect(await response.text()).toBe(fixture);

        await result.save(outputPath);
        expect(await readFile(outputPath, "utf8")).toBe(fixture);
      } finally {
        await rm(outputDir, { recursive: true, force: true });
      }
    }
  });

  it("exposes native CSV and TSV results through row helpers", async () => {
    const cases: TapSyncFormat[] = ["csv", "tsv"];

    for (const format of cases) {
      const mockFetch = createMockTapSyncFetch(
        new Response(await readCoreFixture(fixtureForFormat(format))),
      );
      const result = await tap("https://example.test/tap", {
        fetch: mockFetch,
      }).query("SELECT TOP 2 * FROM mock_source", { format });

      const rows = [];
      for await (const row of result.rows()) {
        rows.push(row);
      }

      expect(rows).toEqual([
        { source_id: "1001", ra: "12.5", dec: "-45.25" },
        { source_id: "1002", ra: "13.5", dec: "-44.75" },
      ]);
      await expect(result.json()).resolves.toEqual(rows);
    }
  });

  it("converts VOTable TABLEDATA results to rows and JSON", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    const result = await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).query("SELECT TOP 2 * FROM mock_source", { format: "votable" });

    const rows = [];
    for await (const row of result.rows()) {
      rows.push(row);
    }

    expect(rows).toEqual([
      { source_id: "1001", ra: "12.5", dec: "-45.25" },
      { source_id: "1002", ra: "13.5", dec: "-44.75" },
    ]);
    await expect(result.json()).resolves.toEqual(rows);
  });

  it("passes through FITS VOTable serializations that row helpers cannot decode", async () => {
    const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <INFO name="QUERY_STATUS" value="OK" />
    <TABLE>
      <FIELD name="source_id" datatype="long" />
      <DATA><FITS /></DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`;
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    const result = await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).query("SELECT TOP 2 * FROM mock_source", { format: "votable" });

    expect(await result.text()).toBe(fixture);
    await expect(result.json()).rejects.toThrow(TapFormatUnsupportedError);
    await expect(async () => {
      for await (const unused of result.rows()) {
        void unused;
      }
    }).rejects.toThrow(TapFormatUnsupportedError);
  });

  it("rejects unsupported first-slice sync formats before requesting TAP", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));

    expect(() => assertSupportedSyncFormat("json")).toThrow(
      TapFormatUnsupportedError,
    );
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("uses anonymous capabilities to guard sync query before submission", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "text/csv" },
      }),
      { capabilities: "vosi-capabilities-anonymous.xml" },
    );

    const result = await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).query("SELECT 1", { format: "csv" });

    expect(await result.text()).toBe(fixture);
    expect(
      mockFetch.allRequests.map((request) => request.url.pathname),
    ).toEqual(["/tap/capabilities", "/tap/sync"]);
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("csv");
  });

  it("allows mixed capabilities when the requested format is advertised", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
      { capabilities: "vosi-capabilities-mixed-votable.xml" },
    );

    const result = await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).query("SELECT 1", { format: "votable" });

    expect(await result.text()).toBe(fixture);
    expect(
      mockFetch.allRequests.map((request) => request.url.pathname),
    ).toEqual(["/tap/capabilities", "/tap/sync"]);
  });

  it("blocks auth-only capabilities before sync query submission", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"), {
      capabilities: "vosi-capabilities-auth-only.xml",
    });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).query("SELECT 1", {
        format: "votable",
      }),
    ).rejects.toThrow(TapAuthUnsupportedError);
    expect(
      mockFetch.allRequests.map((request) => request.url.pathname),
    ).toEqual(["/tap/capabilities"]);
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("blocks clearly unsupported advertised sync formats before submission", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"), {
      capabilities: "vosi-capabilities-votable-only.xml",
    });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).query("SELECT 1", {
        format: "csv",
      }),
    ).rejects.toThrow(TapFormatUnsupportedError);
    expect(
      mockFetch.allRequests.map((request) => request.url.pathname),
    ).toEqual(["/tap/capabilities"]);
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("falls back to sync submission when capabilities are unavailable or incomplete", async () => {
    const fixture = await readCoreFixture("native.csv");
    const cases: (string | Response)[] = [
      new Response("not found", { status: 404 }),
      "malformed.xml",
      "vosi-capabilities-no-tap.xml",
      "vosi-capabilities-empty-formats.xml",
    ];

    for (const capabilities of cases) {
      const mockFetch = createMockTapSyncFetch(
        new Response(fixture, {
          headers: { "content-type": "text/csv" },
        }),
        { capabilities },
      );

      const result = await tap("https://example.test/tap", {
        fetch: mockFetch,
      }).query("SELECT 1", { format: "csv" });

      expect(await result.text()).toBe(fixture);
      expect(
        mockFetch.allRequests.map((request) => request.url.pathname),
      ).toEqual(["/tap/capabilities", "/tap/sync"]);
    }
  });

  it("maps HTTP failures to TapHttpError", async () => {
    const mockFetch = createMockTapSyncFetch(
      new Response("service unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).query("SELECT 1", {
        format: "votable",
      }),
    ).rejects.toThrow(TapHttpError);
  });

  it("maps non-2xx VOTable QUERY_STATUS errors to TapServiceError", async () => {
    const mockFetch = createMockTapSyncFetch(
      new Response(await readCoreFixture("sync-error.votable.xml"), {
        status: 400,
        statusText: "Bad Request",
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).query(
        "SELECT FROM",
        {
          format: "votable",
        },
      ),
    ).rejects.toThrow(TapServiceError);
  });

  it("maps VOTable QUERY_STATUS errors to TapServiceError", async () => {
    const mockFetch = createMockTapSyncFetch(
      new Response(await readCoreFixture("sync-error.votable.xml"), {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).query(
        "SELECT FROM",
        {
          format: "votable",
        },
      ),
    ).rejects.toThrow(TapServiceError);
    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).query(
        "SELECT FROM",
        {
          format: "votable",
        },
      ),
    ).rejects.toThrow("Syntax error near FROM");
  });

  it("maps self-closing VOTable QUERY_STATUS errors to TapServiceError", async () => {
    const mockFetch = createMockTapSyncFetch(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <INFO name="QUERY_STATUS" value="ERROR" />
  </RESOURCE>
</VOTABLE>`,
        {
          headers: { "content-type": "application/x-votable+xml" },
        },
      ),
    );

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).query(
        "SELECT FROM",
        {
          format: "votable",
        },
      ),
    ).rejects.toThrow("QUERY_STATUS ERROR");
  });
});

function fixtureForFormat(format: TapSyncFormat): string {
  switch (format) {
    case "csv":
      return "native.csv";
    case "tsv":
      return "native.tsv";
    case "votable":
      return "sync-success-tabledata.votable.xml";
  }
}
