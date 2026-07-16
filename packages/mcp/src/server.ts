import { readFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerStarfetchGuidance } from "./guidance.js";
import {
  type StarfetchMcpPolicy,
  unrestrictedStarfetchMcpPolicy,
} from "./policy.js";
import { registerStarfetchTools } from "./tools.js";

export type { JobCapabilityOperation, StarfetchMcpPolicy } from "./policy.js";

/** MCP server name advertised to clients. */
export const mcpServerName = "starfetch";
/** MCP server version advertised to clients. */
export const mcpServerVersion = readPackageVersion();

const serverInstructions =
  "Select an explicit TAP service, inspect availability and relevant table and column metadata before writing service-specific ADQL, and execute a small bounded query. On schema or syntax failure, re-inspect metadata before retrying. Report the exact service, table, ADQL, effective limit, output format, and assumptions. Never present a service error as an empty scientific result. Do not provide credentials.";

/** Options for constructing a Starfetch MCP server. */
export type StarfetchMcpServerOptions = {
  /** Custom fetch implementation used by Starfetch core operations. */
  fetch?: typeof fetch;
  /** Optional operational policy, used by hosted deployments. */
  policy?: StarfetchMcpPolicy;
};

export type StarfetchMcpRuntimeOptions = Omit<
  StarfetchMcpServerOptions,
  "policy"
> & {
  policy: StarfetchMcpPolicy;
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

  const runtimeOptions: StarfetchMcpRuntimeOptions = {
    ...options,
    policy: options.policy ?? unrestrictedStarfetchMcpPolicy,
  };

  registerStarfetchTools(server, runtimeOptions);
  registerStarfetchGuidance(server);

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
