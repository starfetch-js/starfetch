import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createStarfetchMcpServer } from "@starfetch-js/mcp";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";

import { loadHttpConfig, type Environment } from "./config.js";
import {
  createExchangeRegistry,
  type ExchangeRegistry,
} from "./exchange-lifecycle.js";
import { closeHttpListener, listen, type HttpListener } from "./listener.js";

export type { Environment } from "./config.js";

export type RunningStarfetchMcpApp = Readonly<{
  origin: URL;
  close(): Promise<void>;
}>;

type OwnedMcpServer = ReturnType<typeof createStarfetchMcpServer>;

type HttpRequestLog = Readonly<{
  durationMs: number;
  event: "http_request";
  method: string;
  path: string;
  requestId: string;
  status: number;
}>;

type McpCleanupFailureLog = Readonly<{
  event: "mcp_cleanup_failed";
  requestId: string;
}>;

type ServerLog = HttpRequestLog | McpCleanupFailureLog;

type ServerDependencies = Readonly<{
  createMcpServer?: () => OwnedMcpServer;
  writeLog?: (event: ServerLog) => void;
}>;

export async function startStarfetchMcpApp(
  environment: Environment = process.env,
  dependencies: ServerDependencies = {},
): Promise<RunningStarfetchMcpApp> {
  const { allowedOrigins, host, port, shutdownGraceMs } =
    loadHttpConfig(environment);
  const createMcpServer =
    dependencies.createMcpServer ?? createStarfetchMcpServer;
  const writeLog = dependencies.writeLog ?? writeJsonLog;
  const exchanges = createExchangeRegistry((requestId) =>
    writeLog({ event: "mcp_cleanup_failed", requestId }),
  );
  const app = new Hono();
  let accepting = true;

  app.use(
    "*",
    requestId({
      headerName: "X-Request-Id",
      limitLength: 128,
    }),
  );
  app.use("*", async (context, next) => {
    const startedAt = performance.now();
    let status = 500;
    try {
      await next();
      status = context.res.status;
    } finally {
      writeLog({
        durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
        event: "http_request",
        method: context.req.method,
        path: context.req.path,
        requestId: context.get("requestId"),
        status,
      });
    }
  });
  if (isLoopbackHost(host)) {
    app.use("*", async (context, next) => {
      if (!isAllowedLoopbackHostHeader(context.req.header("host"))) {
        return context.json({ error: "Host not allowed" }, 403);
      }

      await next();
    });
  }
  app.use("*", async (context, next) => {
    const origin = context.req.header("origin");
    if (origin !== undefined && !allowedOrigins.has(origin)) {
      return context.json({ error: "Origin not allowed" }, 403);
    }

    await next();
  });
  app.use(
    "*",
    cors({
      allowHeaders: [
        "Content-Type",
        "MCP-Protocol-Version",
        "MCP-Session-Id",
        "Last-Event-ID",
        "X-Request-Id",
      ],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      exposeHeaders: ["MCP-Protocol-Version", "MCP-Session-Id", "X-Request-Id"],
      origin: (origin) => (allowedOrigins.has(origin) ? origin : undefined),
    }),
  );

  app.get("/healthz", (context) => context.json({ status: "ok" }));

  app.all("/mcp", async (context) => {
    if (!accepting) {
      return context.json({ error: "Server is shutting down" }, 503);
    }

    const mcpServer = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({});
    const exchange = exchanges.track(
      mcpServer,
      context.req.raw.signal,
      context.get("requestId"),
    );

    try {
      await mcpServer.connect(transport);
      const response = await transport.handleRequest(context.req.raw);
      return await exchange.ownResponse(response);
    } catch (error) {
      await exchange.close();
      throw error;
    }
  });
  app.onError((_error, context) =>
    context.json(
      {
        error: {
          code: -32_603,
          message: "Internal server error",
        },
        id: null,
        jsonrpc: "2.0",
      },
      500,
    ),
  );

  const listener = await listen(app, host, port);
  const address = listener.address();
  if (address === null || typeof address === "string") {
    await closeHttpListener(listener);
    throw new Error("Expected the MCP HTTP listener to use a TCP address.");
  }

  let closePromise: Promise<void> | undefined;

  return {
    origin: new URL(`http://${formatHostname(host)}:${address.port}`),
    close() {
      accepting = false;
      closePromise ??= closeApp(listener, exchanges, shutdownGraceMs);
      return closePromise;
    },
  };
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function isAllowedLoopbackHostHeader(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  try {
    const hostname = new URL(`http://${value}`).hostname;
    return (
      hostname === "127.0.0.1" ||
      hostname === "localhost" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

async function closeApp(
  listener: HttpListener,
  exchanges: ExchangeRegistry,
  shutdownGraceMs: number,
): Promise<void> {
  const deadline = performance.now() + shutdownGraceMs;
  const listenerClosed = closeHttpListener(listener);
  const drained = await exchanges.waitForIdle(shutdownGraceMs);
  if (drained) {
    listener.closeIdleConnections();
  } else {
    exchanges.forceClose();
    listener.closeAllConnections();
  }

  const listenerDidClose = await settlesWithin(
    listenerClosed,
    Math.max(0, deadline - performance.now()),
  );
  if (!listenerDidClose) {
    exchanges.forceClose();
    listener.closeAllConnections();
  }
}

function settlesWithin(
  operation: Promise<void>,
  milliseconds: number,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(false), milliseconds);
    void operation.then(
      () => {
        clearTimeout(timeout);
        resolve(true);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function formatHostname(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function writeJsonLog(event: ServerLog): void {
  console.info(JSON.stringify(event));
}
