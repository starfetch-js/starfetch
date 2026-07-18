import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  readStarfetchSkillFile,
  starfetchSkillPaths,
  type StarfetchSkillPath,
} from "@starfetch-js/skill";
import { describe, expect, it } from "vitest";

import { createStarfetchMcpServer } from "./server.js";

const publishedResourceUris = new Map<StarfetchSkillPath, string>([
  ["references/adql.md", "starfetch://guides/adql"],
  ["references/tap-metadata.md", "starfetch://guides/tap-metadata"],
  ["references/services/gaia.md", "starfetch://services/gaia"],
  ["references/services/simbad.md", "starfetch://services/simbad"],
  ["examples/proper-motion.md", "starfetch://examples/proper-motion"],
]);

describe("Starfetch MCP guidance", () => {
  it("exposes canonical Markdown resources", async () => {
    await withClient(async (client) => {
      const resources = await client.listResources();
      const uris = resources.resources.map((resource) => resource.uri);

      expect(resources.resources).toHaveLength(starfetchSkillPaths.length);
      expect(new Set(uris).size).toBe(uris.length);

      for (const resource of resources.resources) {
        expect(resource.mimeType).toBe("text/markdown");
        expect(resource.title).toMatch(/\S/);
        expect(resource.description).toMatch(/\S/);
      }

      const [exposedEntries, canonicalEntries] = await Promise.all([
        Promise.all(
          uris.map(
            async (uri) =>
              [uri, await readMarkdownResource(client, uri)] as const,
          ),
        ),
        Promise.all(
          starfetchSkillPaths.map(
            async (path) => [path, await readStarfetchSkillFile(path)] as const,
          ),
        ),
      ]);
      const exposedByUri = new Map(exposedEntries);
      const canonicalByPath = new Map(canonicalEntries);
      expect([...exposedByUri.values()].sort()).toEqual(
        [...canonicalByPath.values()].sort(),
      );

      for (const [path, uri] of publishedResourceUris) {
        expect(exposedByUri.get(uri)).toBe(canonicalByPath.get(path));
      }
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

async function readMarkdownResource(
  client: Client,
  uri: string,
): Promise<string> {
  const result = await client.readResource({ uri });
  expect(result.contents).toHaveLength(1);

  const [content] = result.contents;
  expect(content).toEqual(
    expect.objectContaining({
      mimeType: "text/markdown",
      uri,
    }),
  );
  if (content === undefined || !("text" in content)) {
    throw new Error(`Expected Markdown text for ${uri}`);
  }
  return content.text;
}

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
