import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createStarfetchMcpServer } from "@starfetch-js/mcp";
import { describe, expect, it } from "vitest";

import { createStarfetchTableView } from "./presentation.js";

describe("Starfetch table view protocol conformance", () => {
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
        const view = createStarfetchTableView({
          sourceTool: call.name,
          structuredContent: result.structuredContent,
        });
        expect(view.resultKind).toBe(call.expectedKind);
        if (
          call.name === "starfetch_tap_query" ||
          call.name === "starfetch_tap_job_fetch"
        ) {
          expect(view.source).toMatchObject({
            durationMs: expect.any(Number),
            overflow: true,
          });
        }
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
    <INFO name="QUERY_STATUS" value="OVERFLOW">Result truncated</INFO>
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
