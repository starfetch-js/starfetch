import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  mcpName?: unknown;
  name?: unknown;
};

const manifest = JSON.parse(
  readFileSync(new URL("../server.json", import.meta.url), "utf8"),
) as {
  $schema?: unknown;
  description?: string;
  name?: unknown;
  packages?: Array<{
    identifier?: unknown;
    registryType?: unknown;
    transport?: unknown;
    version?: unknown;
  }>;
  repository?: unknown;
  title?: unknown;
  version?: unknown;
};

describe("MCP Registry manifest", () => {
  it("matches the published npm package identity", () => {
    expect(manifest.$schema).toBe(
      "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    );
    expect(packageJson.mcpName).toBe("io.github.starfetch-js/starfetch");
    expect(manifest.name).toBe(packageJson.mcpName);
    expect(manifest.title).toBe("Starfetch");
    expect(manifest.description?.length).toBeLessThanOrEqual(100);
    expect(manifest.repository).toEqual({
      source: "github",
      url: "https://github.com/starfetch-js/starfetch",
    });

    expect(manifest.packages).toEqual([
      {
        identifier: packageJson.name,
        registryType: "npm",
        transport: { type: "stdio" },
        version: manifest.version,
      },
    ]);
  });
});
