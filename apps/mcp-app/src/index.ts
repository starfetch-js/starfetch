#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { startStarfetchMcpApp } from "./server.js";

export { startStarfetchMcpApp } from "./server.js";

async function runHttpServer(): Promise<void> {
  const app = await startStarfetchMcpApp();
  console.info(
    JSON.stringify({
      event: "mcp_http_started",
      origin: app.origin.origin,
    }),
  );

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    void app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(formatError(error));
        process.exit(1);
      },
    );
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  try {
    await runHttpServer();
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
}

function isEntrypoint(
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
  return error instanceof Error ? error.message : "Unknown MCP HTTP error";
}
