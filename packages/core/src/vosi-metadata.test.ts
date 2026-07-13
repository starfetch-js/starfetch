import { describe, expect, it } from "vitest";

import {
  tap,
  TapAuthUnsupportedError,
  TapHttpError,
  TapParseError,
} from "./index.js";
import {
  createMockTapMetadataFetch,
  readCoreFixture,
} from "../test/mock-tap-metadata.js";

describe("TAP VOSI metadata", () => {
  it("reads service availability and forwards abort signals", async () => {
    const controller = new AbortController();
    const mockFetch = createMockTapMetadataFetch({
      "/tap/availability": "vosi-availability-available.xml",
    });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).availability({
        signal: controller.signal,
      }),
    ).resolves.toEqual({
      available: true,
      message: "Service is accepting anonymous TAP requests.",
    });
    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/availability",
    );
    expect(mockFetch.requests[0]?.signal).toBe(controller.signal);
  });

  it("reads unavailable service availability notes", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/availability": "vosi-availability-unavailable.xml",
    });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).availability(),
    ).resolves.toEqual({
      available: false,
      message: "Maintenance window in progress.",
    });
  });

  it("reads anonymous TAP capabilities", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/capabilities": "vosi-capabilities-anonymous.xml",
    });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).capabilities(),
    ).resolves.toEqual({
      auth: "anonymous",
      formats: ["votable", "csv", "tsv"],
      languages: ["ADQL", "PQL"],
    });
  });

  it("reads mixed and auth-only TAP capability auth states", async () => {
    const mixedFetch = createMockTapMetadataFetch({
      "/tap/capabilities": "vosi-capabilities-mixed.xml",
    });
    const authOnlyFetch = createMockTapMetadataFetch({
      "/tap/capabilities": "vosi-capabilities-auth-only.xml",
    });

    await expect(
      tap("https://example.test/tap", { fetch: mixedFetch }).capabilities(),
    ).resolves.toMatchObject({ auth: "mixed", formats: ["json"] });
    await expect(
      tap("https://example.test/tap", {
        fetch: authOnlyFetch,
      }).capabilities(),
    ).resolves.toMatchObject({ auth: "unsupported-auth" });
  });

  it("preserves less common advertised formats and unknown auth", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/capabilities": new Response(`<?xml version="1.0"?>
<capabilities>
  <capability standardID="ivo://ivoa.net/std/TAP">
    <language><name>ADQL</name></language>
    <language><name>ADQL</name></language>
    <language />
    <outputFormat><mime>application/json</mime></outputFormat>
    <outputFormat><alias>jsonl</alias></outputFormat>
    <outputFormat><mime>text/plain</mime></outputFormat>
    <outputFormat><alias>unsupported</alias></outputFormat>
  </capability>
</capabilities>`),
    });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).capabilities(),
    ).resolves.toEqual({
      auth: "unknown",
      formats: ["json", "jsonl", "text"],
      languages: ["ADQL"],
    });
  });

  it("returns an empty unknown summary when TAP capabilities are absent", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/capabilities": new Response(
        '<?xml version="1.0"?><capabilities />',
      ),
    });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).capabilities(),
    ).resolves.toEqual({ auth: "unknown", formats: [], languages: [] });
  });

  it("blocks sync query and async submit when capabilities prove auth-only TAP", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/capabilities": "vosi-capabilities-auth-only.xml",
    });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).query("SELECT 1", {
        format: "votable",
      }),
    ).rejects.toThrow(TapAuthUnsupportedError);
    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).jobs.submit(
        "SELECT 1",
      ),
    ).rejects.toThrow(TapAuthUnsupportedError);
    expect(mockFetch.requests).toHaveLength(2);
    expect(
      mockFetch.requests.every((request) =>
        request.url.pathname.endsWith("/capabilities"),
      ),
    ).toBe(true);
  });

  it("does not block query when capabilities preflight is unavailable", async () => {
    const fixture = await readCoreFixture("native.csv");
    const requests: URL[] = [];
    const mockFetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      requests.push(url);

      if (url.pathname.endsWith("/capabilities")) {
        return new Response("not found", { status: 404 });
      }

      if (url.pathname.endsWith("/sync")) {
        return new Response(fixture, {
          headers: { "content-type": "text/csv" },
        });
      }

      throw new Error(`Unexpected TAP path ${url.pathname}`);
    }) as typeof fetch;

    const result = await tap("https://example.test/tap", {
      fetch: mockFetch,
    }).query("SELECT 1", { format: "csv" });

    expect(await result.text()).toBe(fixture);
    expect(requests.map((url) => url.pathname)).toEqual([
      "/tap/capabilities",
      "/tap/sync",
    ]);
  });

  it("rethrows unexpected capabilities preflight failures", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/capabilities": new Response(
        `<?xml version="1.0"?>
<VOTABLE>
  <RESOURCE type="results">
    <INFO name="QUERY_STATUS" value="ERROR">capabilities denied</INFO>
  </RESOURCE>
</VOTABLE>`,
        {
          headers: { "content-type": "application/x-votable+xml" },
          status: 400,
        },
      ),
    });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).query("SELECT 1", {
        format: "csv",
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: "TAP service error: capabilities denied",
        name: "TapServiceError",
      }),
    );
    expect(mockFetch.requests).toHaveLength(1);
  });

  it("reads tables and exact-match columns", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/tables": "vosi-tables.xml",
    });
    const client = tap("https://example.test/tap", { fetch: mockFetch });

    await expect(client.tables()).resolves.toEqual([
      {
        description: "Gaia DR3 source catalog.",
        name: "gaiadr3.gaia_source",
        schema: "gaiadr3",
      },
      {
        description: "Astrophysical parameters.",
        name: "gaiadr3.astrophysical_parameters",
        schema: "gaiadr3",
      },
    ]);
    await expect(client.columns("gaiadr3.gaia_source")).resolves.toEqual([
      {
        datatype: "BIGINT",
        description: "Unique source identifier.",
        name: "source_id",
        ucd: "meta.id;meta.main",
      },
      {
        datatype: "DOUBLE",
        description: "Right ascension.",
        name: "ra",
        ucd: "pos.eq.ra;meta.main",
        unit: "deg",
      },
    ]);
    await expect(client.columns("gaia_source")).resolves.toEqual([]);
  });

  it("skips nameless tables and columns while keeping sparse metadata", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/tables": new Response(`<?xml version="1.0"?>
<tableset>
  <schema>
    <table><description>Missing table name</description></table>
    <table>
      <name>catalog.sources</name>
      <column><dataType>BIGINT</dataType></column>
      <column><name>source_id</name></column>
    </table>
  </schema>
</tableset>`),
    });
    const client = tap("https://example.test/tap", { fetch: mockFetch });

    await expect(client.tables()).resolves.toEqual([
      { name: "catalog.sources" },
    ]);
    await expect(client.columns("catalog.sources")).resolves.toEqual([
      { name: "source_id" },
    ]);
  });

  it("maps malformed metadata XML to TapParseError", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/availability": "malformed.xml",
    });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).availability(),
    ).rejects.toThrow(TapParseError);
  });

  it("keeps metadata HTTP failures as TapHttpError", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/capabilities": new Response("service unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    });

    await expect(
      tap("https://example.test/tap", { fetch: mockFetch }).capabilities(),
    ).rejects.toThrow(TapHttpError);
  });
});
