import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

import { createHostedStarfetchMcpServer } from "./hosted-server.js";
import { createHostedStarfetchMcpPolicy } from "./hosted-policy.js";
import { createJobCapabilityIssuer } from "./job-capability.js";
import { createStarfetchTableView } from "./presentation.js";

const expectedHostedToolAnnotations = {
  starfetch_list_presets: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
  },
  starfetch_registry_search: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: true,
  },
  starfetch_render_table: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
  },
  starfetch_query_table: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: false,
  },
  starfetch_tap_availability: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: true,
  },
  starfetch_tap_capabilities: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: true,
  },
  starfetch_tap_columns: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: true,
  },
  starfetch_tap_job_delete: {
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  starfetch_tap_job_fetch: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: true,
  },
  starfetch_tap_job_status: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: true,
  },
  starfetch_tap_job_wait: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: true,
  },
  starfetch_tap_query: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: false,
  },
  starfetch_tap_submit_job: {
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  starfetch_tap_tables: {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: true,
  },
} as const;

describe("hosted Starfetch MCP server", () => {
  it("adds the portable table renderer and immutable widget resource", async () => {
    const widgetHtml = "<!doctype html><title>Starfetch results</title>";
    const tapFetch = vi.fn(async () =>
      Promise.resolve(
        new Response(createVotable(125), {
          headers: { "content-type": "application/x-votable+xml" },
        }),
      ),
    );
    const server = createHostedStarfetchMcpServer({
      loadWidgetHtml: async () => widgetHtml,
      publicOrigin: "https://starfetch-production.run.app",
      mcp: {
        fetch: tapFetch,
        policy: createHostedStarfetchMcpPolicy({
          jobCapabilities: createJobCapabilityIssuer({
            secret: new Uint8Array(32).fill(4),
          }),
        }),
      },
    });
    const client = new Client({
      name: "starfetch-widget-surface-test",
      version: "0.0.0",
    });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);

      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(14);
      expect(
        Object.fromEntries(
          tools.tools.map((tool) => [tool.name, tool.annotations]),
        ),
      ).toEqual(expectedHostedToolAnnotations);
      const statusTool = tools.tools.find(
        (tool) => tool.name === "starfetch_tap_job_status",
      );
      const deleteTool = tools.tools.find(
        (tool) => tool.name === "starfetch_tap_job_delete",
      );
      expect(statusTool?.inputSchema).toHaveProperty(
        "properties.jobCapability",
      );
      expect(deleteTool?.inputSchema).not.toHaveProperty("properties.confirm");
      expect(tools.tools).toContainEqual(
        expect.objectContaining({
          name: "starfetch_render_table",
          _meta: expect.objectContaining({
            ui: expect.objectContaining({
              resourceUri: "ui://starfetch/table/v1",
            }),
          }),
        }),
      );
      expect(tools.tools).toContainEqual(
        expect.objectContaining({
          name: "starfetch_query_table",
          _meta: expect.objectContaining({
            ui: expect.objectContaining({
              resourceUri: "ui://starfetch/table/v1",
            }),
          }),
        }),
      );

      const view = createStarfetchTableView({
        sourceTool: "starfetch_list_presets",
        structuredContent: {
          data: [
            {
              label: "Example TAP",
              name: "example",
              url: "https://example.test/tap",
            },
          ],
          diagnostics: { count: 1 },
        },
      });
      const result = await client.callTool({
        name: "starfetch_render_table",
        arguments: view,
      });
      expect(result).toMatchObject({
        content: [
          {
            type: "text",
            text: "Rendered 1 row in the Starfetch results table.",
          },
        ],
        structuredContent: view,
      });

      const queryResult = await client.callTool({
        name: "starfetch_query_table",
        arguments: {
          query: "SELECT TOP 125 source_id FROM mock_source",
          url: "https://example.test/tap",
        },
      });
      expect(queryResult.isError).toBeUndefined();
      expect(queryResult.structuredContent).toMatchObject({
        clipping: { reasons: ["rows"], sourceRows: 125 },
        rows: expect.arrayContaining([{ source_id: "1" }]),
        source: { effectiveMaxrec: 1_000 },
      });
      expect(
        (queryResult.structuredContent as { rows: unknown[] }).rows,
      ).toHaveLength(20);
      expect(
        (
          queryResult._meta?.starfetchTableDataset as {
            view: { rows: unknown[] };
          }
        ).view.rows,
      ).toHaveLength(125);

      const resources = await client.listResources();
      expect(resources.resources).toContainEqual(
        expect.objectContaining({
          mimeType: "text/html;profile=mcp-app",
          uri: "ui://starfetch/table/v1",
        }),
      );
      const resource = await client.readResource({
        uri: "ui://starfetch/table/v1",
      });
      expect(resource.contents).toEqual([
        expect.objectContaining({
          mimeType: "text/html;profile=mcp-app",
          text: widgetHtml,
          uri: "ui://starfetch/table/v1",
          _meta: expect.objectContaining({
            ui: expect.objectContaining({
              csp: {
                connectDomains: [],
                resourceDomains: [],
              },
              domain: "https://starfetch-production.run.app",
              permissions: { clipboardWrite: {} },
              prefersBorder: false,
            }),
          }),
        }),
      ]);

      const invalidResult = await client.callTool({
        name: "starfetch_render_table",
        arguments: { contractVersion: 2, secret: "must-not-leak" },
      });
      expect(invalidResult.isError).toBe(true);
      expect(JSON.stringify(invalidResult)).not.toContain("must-not-leak");
    } finally {
      await client.close();
      await server.close();
    }
  });
});

function createVotable(rowCount: number): string {
  const rows = Array.from(
    { length: rowCount },
    (_, index) => `<TR><TD>${index + 1}</TD></TR>`,
  ).join("");
  return `<?xml version="1.0"?>
<VOTABLE version="1.4">
  <RESOURCE type="results">
    <INFO name="QUERY_STATUS" value="OK">Successful query</INFO>
    <TABLE>
      <FIELD name="source_id" datatype="long" />
      <DATA><TABLEDATA>${rows}</TABLEDATA></DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`;
}
