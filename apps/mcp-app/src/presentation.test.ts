import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStarfetchMcpServer } from "@starfetch-js/mcp";
import { describe, expect, it } from "vitest";

import {
  createStarfetchTableView,
  STARFETCH_TABLE_VIEW_LIMITS_V1,
  StarfetchPresentationError,
  starfetchTableViewV1Schema,
} from "./presentation.js";

describe("createStarfetchTableView", () => {
  it("normalizes TAP presets through the versioned presentation interface", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_list_presets",
      structuredContent: {
        data: [
          {
            label: "ESA Gaia Archive",
            name: "gaia",
            url: "https://gea.esac.esa.int/tap-server/tap",
          },
          {
            name: "custom",
            syncRequest: "doQuery",
            url: "https://example.test/tap",
          },
        ],
        diagnostics: { count: 2 },
      },
    });

    expect(view).toEqual({
      clipping: {
        applied: false,
        includedColumns: 4,
        includedRows: 2,
        reasons: [],
        serializedBytes: expect.any(Number),
        sourceColumns: 4,
        sourceRows: 2,
      },
      columns: [
        { key: "name", label: "Name" },
        { key: "label", label: "Label" },
        { key: "url", label: "TAP URL" },
        { key: "syncRequest", label: "Sync request" },
      ],
      contractVersion: 1,
      resultKind: "presets",
      rows: [
        {
          label: "ESA Gaia Archive",
          name: "gaia",
          syncRequest: null,
          url: "https://gea.esac.esa.int/tap-server/tap",
        },
        {
          label: null,
          name: "custom",
          syncRequest: "doQuery",
          url: "https://example.test/tap",
        },
      ],
      source: { tool: "starfetch_list_presets" },
      state: "populated",
      title: "Starfetch TAP service presets",
    });
    expect(starfetchTableViewV1Schema.parse(view)).toEqual(view);
    expect(view.clipping.serializedBytes).toBeLessThanOrEqual(
      STARFETCH_TABLE_VIEW_LIMITS_V1.maxSerializedBytes,
    );
  });

  it("normalizes registry matches with registry provenance", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_registry_search",
      structuredContent: {
        data: [
          {
            accessUrl: "https://example.test/tap",
            description: "Example registry TAP service.",
            ivoid: "ivo://example.test/gaia",
            shortName: "GAIA",
            standardId: "ivo://ivoa.net/std/tap",
            title: "Example Gaia TAP",
          },
        ],
        diagnostics: {
          count: 1,
          registryUrl: "https://registry.example.test/tap",
        },
      },
    });

    expect(view).toMatchObject({
      columns: [
        { key: "shortName", label: "Short name" },
        { key: "title", label: "Title" },
        { key: "description", label: "Description" },
        { key: "accessUrl", label: "TAP URL" },
        { key: "ivoid", label: "IVOA identifier" },
        { key: "standardId", label: "Standard identifier" },
      ],
      resultKind: "registry-services",
      rows: [
        {
          accessUrl: "https://example.test/tap",
          description: "Example registry TAP service.",
          ivoid: "ivo://example.test/gaia",
          shortName: "GAIA",
          standardId: "ivo://ivoa.net/std/tap",
          title: "Example Gaia TAP",
        },
      ],
      source: {
        registryUrl: "https://registry.example.test/tap",
        tool: "starfetch_registry_search",
      },
      title: "TAP registry service matches",
    });
    expect(starfetchTableViewV1Schema.parse(view)).toEqual(view);
  });

  it("normalizes TAP tables with target provenance", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_tap_tables",
      structuredContent: {
        data: [
          {
            description: "Gaia DR3 source catalog.",
            name: "gaiadr3.gaia_source",
            schema: "gaiadr3",
          },
        ],
        diagnostics: {
          count: 1,
          target: {
            baseUrl: "https://example.test/tap",
            label: "Example TAP",
            service: "example",
          },
        },
      },
    });

    expect(view).toMatchObject({
      columns: [
        { key: "schema", label: "Schema" },
        { key: "name", label: "Table" },
        { key: "description", label: "Description" },
      ],
      resultKind: "tables",
      rows: [
        {
          description: "Gaia DR3 source catalog.",
          name: "gaiadr3.gaia_source",
          schema: "gaiadr3",
        },
      ],
      source: {
        target: {
          baseUrl: "https://example.test/tap",
          label: "Example TAP",
          service: "example",
        },
        tool: "starfetch_tap_tables",
      },
      title: "Example TAP tables",
    });
  });

  it("normalizes TAP columns without inventing missing metadata", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_tap_columns",
      structuredContent: {
        data: [
          {
            datatype: "BIGINT",
            description: "Unique source identifier.",
            name: "source_id",
            ucd: "meta.id;meta.main",
          },
          {
            datatype: "DOUBLE",
            name: "ra",
            ucd: "pos.eq.ra;meta.main",
            unit: "deg",
          },
        ],
        diagnostics: {
          count: 2,
          table: "gaiadr3.gaia_source",
          target: { baseUrl: "https://example.test/tap" },
        },
      },
    });

    expect(view).toMatchObject({
      columns: [
        { key: "name", label: "Column" },
        { key: "datatype", label: "Datatype" },
        { key: "unit", label: "Unit" },
        { key: "ucd", label: "UCD" },
        { key: "description", label: "Description" },
      ],
      resultKind: "columns",
      rows: [
        {
          datatype: "BIGINT",
          description: "Unique source identifier.",
          name: "source_id",
          ucd: "meta.id;meta.main",
          unit: null,
        },
        {
          datatype: "DOUBLE",
          description: null,
          name: "ra",
          ucd: "pos.eq.ra;meta.main",
          unit: "deg",
        },
      ],
      source: {
        table: "gaiadr3.gaia_source",
        target: { baseUrl: "https://example.test/tap" },
        tool: "starfetch_tap_columns",
      },
      title: "gaiadr3.gaia_source columns",
    });
  });

  it("normalizes sync JSON rows without coercing scientific values", () => {
    const query =
      "SELECT TOP 2 source_id, flux, note, missing FROM catalog.sources";
    const view = createStarfetchTableView({
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: JSON.stringify([
            {
              source_id: "9007199254740993",
              flux: "-0",
              note: 'α "quoted"\nvalue',
              missing: null,
            },
            {
              source_id: "2",
              flux: "1.20e-03",
              note: "",
              missing: null,
            },
          ]),
          format: "json",
        },
        diagnostics: {
          effectiveMaxrec: 2,
          format: "json",
          query,
          requestFormat: "votable",
          runId: "science-run",
          target: {
            baseUrl: "https://example.test/tap",
            label: "Example TAP",
          },
          uploadCount: 0,
        },
      },
    });

    expect(view).toMatchObject({
      columns: [
        { key: "source_id", label: "source_id" },
        { key: "flux", label: "flux" },
        { key: "note", label: "note" },
        { key: "missing", label: "missing" },
      ],
      resultKind: "query-rows",
      rows: [
        {
          flux: "-0",
          missing: null,
          note: 'α "quoted"\nvalue',
          source_id: "9007199254740993",
        },
        {
          flux: "1.20e-03",
          missing: null,
          note: "",
          source_id: "2",
        },
      ],
      source: {
        effectiveMaxrec: 2,
        format: "json",
        query,
        requestFormat: "votable",
        runId: "science-run",
        target: {
          baseUrl: "https://example.test/tap",
          label: "Example TAP",
        },
        tool: "starfetch_tap_query",
      },
      title: "Example TAP query results",
    });
  });

  it("normalizes async JSON rows without leaking or inventing provenance", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_tap_job_fetch",
      structuredContent: {
        data: {
          content: JSON.stringify([{ source_id: "9007199254740993" }]),
          format: "json",
        },
        diagnostics: {
          capability: "signed-secret-value",
          format: "json",
          job: {
            id: "job-123",
            url: "https://example.test/tap/async/job-123",
          },
          requestFormat: "votable",
          sourceFormat: "csv",
          target: { baseUrl: "https://example.test/tap" },
        },
      },
    });

    expect(view).toMatchObject({
      resultKind: "async-query-rows",
      rows: [{ source_id: "9007199254740993" }],
      source: {
        format: "json",
        job: {
          id: "job-123",
          url: "https://example.test/tap/async/job-123",
        },
        requestFormat: "votable",
        sourceFormat: "csv",
        target: { baseUrl: "https://example.test/tap" },
        tool: "starfetch_tap_job_fetch",
      },
      title: "https://example.test/tap async job results",
    });
    expect(JSON.stringify(view)).not.toContain("signed-secret-value");
    expect(view.source).not.toHaveProperty("query");
    expect(view.source).not.toHaveProperty("effectiveMaxrec");
  });

  it("distinguishes successful empty results from presentation failures", () => {
    const empty = createStarfetchTableView({
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: { content: "[]", format: "json" },
        diagnostics: {
          effectiveMaxrec: 10,
          format: "json",
          query: "SELECT TOP 10 source_id FROM catalog.sources",
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    });

    expect(empty).toMatchObject({
      columns: [],
      rows: [],
      state: "empty",
    });

    expect(() =>
      createStarfetchTableView({
        sourceTool: "starfetch_tap_query",
        structuredContent: {
          data: { content: "not JSON", format: "json" },
          diagnostics: {
            effectiveMaxrec: 10,
            format: "json",
            query: "SELECT TOP 10 source_id FROM catalog.sources",
            requestFormat: "votable",
            target: { baseUrl: "https://example.test/tap" },
            uploadCount: 0,
          },
        },
      }),
    ).toThrow(
      expect.objectContaining<Partial<StarfetchPresentationError>>({
        code: "INVALID_SOURCE",
      }),
    );

    expect(() =>
      createStarfetchTableView({
        sourceTool: "starfetch_tap_query",
        structuredContent: {
          data: { content: "source_id\n1\n", format: "csv" },
          diagnostics: {
            effectiveMaxrec: 10,
            format: "csv",
            query: "SELECT TOP 10 source_id FROM catalog.sources",
            requestFormat: "csv",
            target: { baseUrl: "https://example.test/tap" },
            uploadCount: 0,
          },
        },
      }),
    ).toThrow(
      expect.objectContaining<Partial<StarfetchPresentationError>>({
        code: "UNSUPPORTED_FORMAT",
      }),
    );
  });

  it("clips only whole trailing rows and columns in a deterministic order", () => {
    const sourceRow = Object.fromEntries(
      Array.from(
        { length: STARFETCH_TABLE_VIEW_LIMITS_V1.maxColumns + 1 },
        (_, index) => [`column_${String(index).padStart(2, "0")}`, "x"],
      ),
    );
    const input = {
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: JSON.stringify(
            Array.from(
              { length: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows + 1 },
              () => sourceRow,
            ),
          ),
          format: "json",
        },
        diagnostics: {
          effectiveMaxrec: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows + 1,
          format: "json",
          query: "SELECT * FROM wide_table",
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    };

    const first = createStarfetchTableView(input);
    const second = createStarfetchTableView(input);

    expect(first.clipping).toMatchObject({
      applied: true,
      includedColumns: STARFETCH_TABLE_VIEW_LIMITS_V1.maxColumns,
      includedRows: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows,
      reasons: ["columns", "rows"],
      sourceColumns: STARFETCH_TABLE_VIEW_LIMITS_V1.maxColumns + 1,
      sourceRows: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows + 1,
    });
    expect(first.columns.at(-1)?.key).toBe("column_31");
    expect(first.rows).toHaveLength(STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows);
    expect(Object.keys(first.rows[0] ?? {})).toEqual(
      first.columns.map((column) => column.key),
    );
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("preserves exact strings at the byte ceiling and rejects longer values", () => {
    const exactValue = "😀".repeat(
      STARFETCH_TABLE_VIEW_LIMITS_V1.maxStringBytes / 4,
    );
    const createInput = (value: string) => ({
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: JSON.stringify([{ value }]),
          format: "json",
        },
        diagnostics: {
          effectiveMaxrec: 1,
          format: "json",
          query: "SELECT TOP 1 value FROM exact_values",
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    });

    expect(createStarfetchTableView(createInput(exactValue)).rows).toEqual([
      { value: exactValue },
    ]);
    expect(() =>
      createStarfetchTableView(createInput(`${exactValue}a`)),
    ).toThrow(
      expect.objectContaining<Partial<StarfetchPresentationError>>({
        code: "VALUE_TOO_LONG",
      }),
    );
  });

  it("clips trailing rows until the serialized view fits its byte ceiling", () => {
    const value = "x".repeat(1_000);
    const view = createStarfetchTableView({
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: JSON.stringify(
            Array.from(
              { length: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows },
              (_, index) => ({
                value: `${String(index).padStart(3, "0")}${value}`,
              }),
            ),
          ),
          format: "json",
        },
        diagnostics: {
          effectiveMaxrec: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows,
          format: "json",
          query: "SELECT value FROM large_rows",
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    });

    expect(view.clipping).toMatchObject({
      applied: true,
      reasons: ["bytes"],
      sourceRows: STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows,
    });
    expect(view.clipping.includedRows).toBeLessThan(
      STARFETCH_TABLE_VIEW_LIMITS_V1.maxRows,
    );
    expect(view.clipping.serializedBytes).toBeLessThanOrEqual(
      STARFETCH_TABLE_VIEW_LIMITS_V1.maxSerializedBytes,
    );
    expect(view.rows.at(-1)?.value).toBe(
      `${String(view.rows.length - 1).padStart(3, "0")}${value}`,
    );
  });

  it("rejects views with inconsistent bounded-state metadata", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_list_presets",
      structuredContent: {
        data: [],
        diagnostics: { count: 0 },
      },
    });

    expect(() =>
      starfetchTableViewV1Schema.parse({
        ...view,
        clipping: { ...view.clipping, serializedBytes: 0 },
      }),
    ).toThrow();
    expect(() =>
      starfetchTableViewV1Schema.parse({
        ...view,
        clipping: { ...view.clipping, includedRows: 1 },
      }),
    ).toThrow();
    expect(() =>
      starfetchTableViewV1Schema.parse({ ...view, state: "populated" }),
    ).toThrow();
  });

  it("accepts all six result families from the public MCP protocol", async () => {
    const server = createStarfetchMcpServer({ fetch: createProtocolFetch() });
    const client = new Client({
      name: "starfetch-presentation-contract-test",
      version: "0.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const calls = [
        {
          arguments: {},
          expectedKind: "presets",
          name: "starfetch_list_presets",
        },
        {
          arguments: {
            maxrec: 1,
            query: "gaia",
            registryUrl: "https://registry.example.test/tap",
          },
          expectedKind: "registry-services",
          name: "starfetch_registry_search",
        },
        {
          arguments: { url: "https://example.test/tap" },
          expectedKind: "tables",
          name: "starfetch_tap_tables",
        },
        {
          arguments: {
            table: "catalog.sources",
            url: "https://example.test/tap",
          },
          expectedKind: "columns",
          name: "starfetch_tap_columns",
        },
        {
          arguments: {
            format: "json",
            maxrec: 1,
            query: "SELECT TOP 1 source_id FROM catalog.sources",
            url: "https://example.test/tap",
          },
          expectedKind: "query-rows",
          name: "starfetch_tap_query",
        },
        {
          arguments: {
            format: "json",
            jobIdOrUrl: "https://example.test/tap/async/job-123",
            sourceFormat: "votable",
          },
          expectedKind: "async-query-rows",
          name: "starfetch_tap_job_fetch",
        },
      ] as const;

      for (const call of calls) {
        const result = await client.callTool({
          arguments: call.arguments,
          name: call.name,
        });

        expect(result.isError).not.toBe(true);
        expect(
          createStarfetchTableView({
            sourceTool: call.name,
            structuredContent: result.structuredContent,
          }).resultKind,
        ).toBe(call.expectedKind);
      }
    } finally {
      await client.close();
      await server.close();
    }
  });
});

function createProtocolFetch(): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    if (url.pathname.endsWith("/capabilities")) {
      return new Response("not found", { status: 404 });
    }
    if (url.pathname.endsWith("/tables")) {
      return xmlResponse(VOSI_TABLES);
    }
    if (url.pathname.endsWith("/results/result")) {
      return xmlResponse(QUERY_RESULT);
    }
    if (url.pathname.endsWith("/sync")) {
      return xmlResponse(
        url.hostname === "registry.example.test"
          ? REGISTRY_RESULT
          : QUERY_RESULT,
      );
    }

    throw new Error(
      `Unexpected protocol test request: ${request.method} ${url.href}`,
    );
  };
}

function xmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: { "content-type": "application/x-votable+xml" },
  });
}

const VOSI_TABLES = `<?xml version="1.0"?>
<tableset>
  <schema>
    <name>catalog</name>
    <table>
      <name>catalog.sources</name>
      <description>Example source catalog.</description>
      <column>
        <name>source_id</name>
        <dataType>BIGINT</dataType>
        <ucd>meta.id;meta.main</ucd>
        <description>Unique source identifier.</description>
      </column>
    </table>
  </schema>
</tableset>`;

const QUERY_RESULT = `<?xml version="1.0"?>
<VOTABLE>
  <RESOURCE type="results">
    <INFO name="QUERY_STATUS" value="OK">Successful query</INFO>
    <TABLE>
      <FIELD name="source_id" datatype="long" />
      <DATA><TABLEDATA><TR><TD>9007199254740993</TD></TR></TABLEDATA></DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`;

const REGISTRY_RESULT = `<?xml version="1.0"?>
<VOTABLE>
  <RESOURCE type="results">
    <INFO name="QUERY_STATUS" value="OK">Successful query</INFO>
    <TABLE>
      <FIELD name="ivoid" datatype="char" arraysize="*" />
      <FIELD name="res_title" datatype="char" arraysize="*" />
      <FIELD name="short_name" datatype="char" arraysize="*" />
      <FIELD name="res_description" datatype="char" arraysize="*" />
      <FIELD name="access_url" datatype="char" arraysize="*" />
      <FIELD name="standard_id" datatype="char" arraysize="*" />
      <DATA>
        <TABLEDATA>
          <TR>
            <TD>ivo://example.test/gaia</TD>
            <TD>Example Gaia TAP</TD>
            <TD>GAIA</TD>
            <TD>Example registry TAP service.</TD>
            <TD>https://example.test/tap</TD>
            <TD>ivo://ivoa.net/std/tap</TD>
          </TR>
        </TABLEDATA>
      </DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`;
