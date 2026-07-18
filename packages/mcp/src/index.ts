#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createStarfetchMcpServer } from "./server.js";
export {
  createStarfetchMcpServer,
  type JobCapabilityOperation,
  type StarfetchMcpPolicy,
  type StarfetchMcpServerOptions,
} from "./server.js";
export { unrestrictedStarfetchMcpPolicy } from "./policy.js";
export {
  tapQueryInputShape,
  tapQueryInputSchema,
  tapTargetInputShape,
  type TapQueryInput,
  type TapQueryOutput,
} from "./schemas.js";
export { executeStarfetchTapQuery } from "./query-execution.js";
export {
  parseStarfetchTablePresentationSource,
  type StarfetchTablePresentationSource,
} from "./table-presentation-source.js";

/**
 * Start the Starfetch MCP server on stdio.
 *
 * This is the package binary entrypoint used by `starfetch-mcp` and
 * `npx -y @starfetch-js/mcp`.
 */
export async function runStdioServer(): Promise<void> {
  const server = createStarfetchMcpServer();
  await server.connect(new StdioServerTransport());
}

if (isMcpEntrypoint(import.meta.url, process.argv[1])) {
  try {
    await runStdioServer();
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
}

export function isMcpEntrypoint(
  moduleUrl: string,
  argvPath: string | undefined,
): boolean {
  if (argvPath === undefined) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown MCP server error";
}
