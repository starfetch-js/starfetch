import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createHostedStarfetchMcpServer } from "./hosted-server.js";
import { createHostedStarfetchMcpPolicy } from "./hosted-policy.js";
import { createJobCapabilityIssuer } from "./job-capability.js";
import { createStarfetchTableView } from "./presentation.js";

describe("hosted Starfetch MCP server", () => {
  it("adds the portable table renderer and immutable widget resource", async () => {
    const widgetHtml = "<!doctype html><title>Starfetch results</title>";
    const server = createHostedStarfetchMcpServer({
      loadWidgetHtml: async () => widgetHtml,
      mcp: {
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
      expect(tools.tools).toHaveLength(13);
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
