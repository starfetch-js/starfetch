import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createStarfetchMcpServer } from "./server.js";

describe("Starfetch MCP guidance", () => {
  it("exposes canonical Markdown resources", async () => {
    await withClient(async (client) => {
      const resources = await client.listResources();

      expect(
        resources.resources.map((resource) => resource.uri).sort(),
      ).toEqual([
        "starfetch://examples/proper-motion",
        "starfetch://guides/adql",
        "starfetch://guides/tap-metadata",
        "starfetch://services/gaia",
        "starfetch://services/simbad",
      ]);

      const result = await client.readResource({
        uri: "starfetch://guides/adql",
      });
      expect(result.contents).toEqual([
        expect.objectContaining({
          mimeType: "text/markdown",
          text: expect.stringContaining("Construct ADQL only after inspecting"),
          uri: "starfetch://guides/adql",
        }),
      ]);
    });
  });

  it("exposes metadata-first workflow prompts", async () => {
    await withClient(async (client) => {
      const prompts = await client.listPrompts();

      expect(prompts.prompts.map((prompt) => prompt.name).sort()).toEqual([
        "explore_service",
        "query_astronomy_catalog",
        "run_cone_search",
        "troubleshoot_adql",
      ]);

      const result = await client.getPrompt({
        arguments: {
          question: "Find nearby high proper motion sources",
          service: "gaia",
        },
        name: "query_astronomy_catalog",
      });
      expect(result.messages[0]?.content).toEqual(
        expect.objectContaining({
          text: expect.stringContaining("Inspect columns for that exact table"),
          type: "text",
        }),
      );

      const troubleshoot = await client.getPrompt({
        arguments: {
          error: "Unknown column",
          query: "SELECT TOP 5 invented FROM table_name",
          service: "gaia",
        },
        name: "troubleshoot_adql",
      });
      expect(troubleshoot.messages[0]?.content).toEqual(
        expect.objectContaining({
          text: expect.stringContaining(
            "Do not report the failure as an empty result",
          ),
        }),
      );
    });
  });
});

async function withClient(
  run: (client: Client) => Promise<void>,
): Promise<void> {
  const server = createStarfetchMcpServer();
  const client = new Client({
    name: "starfetch-guidance-test",
    version: "0.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}
