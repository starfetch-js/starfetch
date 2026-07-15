#!/usr/bin/env node
import { isMcpEntrypoint } from "@starfetch-js/mcp";

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
      process.exit(1);
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

if (isMcpEntrypoint(import.meta.url, process.argv[1])) {
  try {
    await runHttpServer();
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown MCP HTTP error";
}
