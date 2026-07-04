import { readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerStarfetchTools } from "./tools.js";

/** MCP server name advertised to clients. */
export const mcpServerName = "starfetch";
/** MCP server version advertised to clients. */
export const mcpServerVersion = readPackageVersion();

const serverInstructions =
  "Use Starfetch tools to inspect TAP service metadata before writing service-specific ADQL. Use explicit service presets or TAP base URLs, keep public service requests bounded, and do not provide credentials.";

/** Options for constructing a Starfetch MCP server. */
export type StarfetchMcpServerOptions = {
  /** Custom fetch implementation used by Starfetch core operations. */
  fetch?: typeof fetch;
};

/**
 * Create a Starfetch MCP server and register all Starfetch TAP tools.
 *
 * The server is transport-agnostic; callers connect it to stdio or another MCP
 * transport after construction.
 */
export function createStarfetchMcpServer(
  options: StarfetchMcpServerOptions = {},
): McpServer {
  const server = new McpServer(
    {
      name: mcpServerName,
      title: "Starfetch",
      version: mcpServerVersion,
    },
    {
      instructions: serverInstructions,
    },
  );

  registerStarfetchTools(server, options);

  return server;
}

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version?: unknown };

  if (typeof packageJson.version !== "string") {
    throw new Error("Expected MCP package.json to define a string version.");
  }

  return packageJson.version;
}
