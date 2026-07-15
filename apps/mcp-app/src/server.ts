import { type Server } from "node:http";

import { serve } from "@hono/node-server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createStarfetchMcpServer } from "@starfetch-js/mcp";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";

export type Environment = Readonly<Record<string, string | undefined>>;

export type RunningStarfetchMcpApp = Readonly<{
  origin: URL;
  close(): Promise<void>;
}>;

type OwnedMcpServer = ReturnType<typeof createStarfetchMcpServer>;
type StarfetchMcpServerOptions = NonNullable<
  Parameters<typeof createStarfetchMcpServer>[0]
>;

type OwnedMcpExchange = Readonly<{
  close(): Promise<void>;
}>;

type HttpRequestLog = Readonly<{
  durationMs: number;
  event: "http_request";
  method: string;
  path: string;
  requestId: string;
  status: number;
}>;

type ServerDependencies = Readonly<{
  createMcpServer?: (options?: StarfetchMcpServerOptions) => OwnedMcpServer;
  writeLog?: (event: HttpRequestLog) => void;
}>;

export async function startStarfetchMcpApp(
  environment: Environment = process.env,
  dependencies: ServerDependencies = {},
): Promise<RunningStarfetchMcpApp> {
  const host = parseHost(environment.HOST);
  const port = parsePort(environment.PORT);
  const shutdownGraceMs = parseShutdownGrace(environment.SHUTDOWN_GRACE_MS);
  const allowedOrigins = parseAllowedOrigins(environment.ALLOWED_ORIGINS);
  const createMcpServer =
    dependencies.createMcpServer ?? createStarfetchMcpServer;
  const writeLog = dependencies.writeLog ?? writeJsonLog;
  const activeExchanges = new Set<OwnedMcpExchange>();
  const drainWaiters = new Set<() => void>();
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
    let closePromise: Promise<void> | undefined;
    const exchange: OwnedMcpExchange = {
      close() {
        closePromise ??= closeMcpExchange(
          mcpServer,
          exchange,
          activeExchanges,
          drainWaiters,
          context.req.raw.signal,
          abortListener,
        );
        return closePromise;
      },
    };
    const abortListener = () => void exchange.close();
    context.req.raw.signal.addEventListener("abort", abortListener, {
      once: true,
    });
    activeExchanges.add(exchange);

    try {
      await mcpServer.connect(transport);
      const response = await transport.handleRequest(context.req.raw);
      return await finalizeWithResponse(response, exchange.close);
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
    await closeListener(listener);
    throw new Error("Expected the MCP HTTP listener to use a TCP address.");
  }

  let closePromise: Promise<void> | undefined;

  return {
    origin: new URL(`http://${formatHostname(host)}:${address.port}`),
    close() {
      accepting = false;
      closePromise ??= closeApp(
        listener,
        activeExchanges,
        drainWaiters,
        shutdownGraceMs,
      );
      return closePromise;
    },
  };
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return 3000;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }

  return port;
}

function parseHost(value: string | undefined): string {
  if (value === undefined) {
    return "127.0.0.1";
  }

  if (value === "" || value !== value.trim()) {
    throw new Error("HOST must be a non-empty hostname or IP address.");
  }

  return value;
}

function parseShutdownGrace(value: string | undefined): number {
  if (value === undefined) {
    return 10_000;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(
      "SHUTDOWN_GRACE_MS must be an integer between 1 and 60000.",
    );
  }

  const milliseconds = Number(value);
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 1 ||
    milliseconds > 60_000
  ) {
    throw new Error(
      "SHUTDOWN_GRACE_MS must be an integer between 1 and 60000.",
    );
  }

  return milliseconds;
}

function parseAllowedOrigins(value: string | undefined): Set<string> {
  if (value === undefined || value.trim() === "") {
    return new Set();
  }

  return new Set(
    value.split(",").map((candidate) => {
      const origin = candidate.trim();
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throw new Error(
          "ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins.",
        );
      }

      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.origin !== origin
      ) {
        throw new Error(
          "ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins.",
        );
      }

      return origin;
    }),
  );
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

function listen(app: Hono, host: string, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const listener = serve(
      {
        fetch: app.fetch,
        hostname: host,
        port,
      },
      () => resolve(listener as Server),
    );
    listener.once("error", reject);
  });
}

async function closeApp(
  listener: Server,
  activeExchanges: Set<OwnedMcpExchange>,
  drainWaiters: Set<() => void>,
  shutdownGraceMs: number,
): Promise<void> {
  const listenerClosed = closeListener(listener);
  const drained = await waitForDrain(
    activeExchanges,
    drainWaiters,
    shutdownGraceMs,
  );
  if (drained) {
    listener.closeIdleConnections();
  } else {
    await Promise.allSettled(
      [...activeExchanges].map((exchange) => exchange.close()),
    );
    listener.closeAllConnections();
  }
  await listenerClosed;
}

async function closeMcpExchange(
  server: OwnedMcpServer,
  exchange: OwnedMcpExchange,
  activeExchanges: Set<OwnedMcpExchange>,
  drainWaiters: Set<() => void>,
  signal: AbortSignal,
  abortListener: () => void,
): Promise<void> {
  signal.removeEventListener("abort", abortListener);
  activeExchanges.delete(exchange);
  try {
    await server.close();
  } finally {
    if (activeExchanges.size === 0) {
      for (const resolve of drainWaiters) {
        resolve();
      }
      drainWaiters.clear();
    }
  }
}

function waitForDrain(
  activeExchanges: Set<OwnedMcpExchange>,
  drainWaiters: Set<() => void>,
  shutdownGraceMs: number,
): Promise<boolean> {
  if (activeExchanges.size === 0) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (drained: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      drainWaiters.delete(onDrained);
      resolve(drained);
    };
    const onDrained = () => finish(true);
    const timeout = setTimeout(() => finish(false), shutdownGraceMs);
    drainWaiters.add(onDrained);
  });
}

async function finalizeWithResponse(
  response: Response,
  close: () => Promise<void>,
): Promise<Response> {
  if (response.body === null) {
    await close();
    return response;
  }

  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await close();
      }
    },
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          await close();
          controller.close();
          return;
        }

        controller.enqueue(result.value);
      } catch (error) {
        await close();
        controller.error(error);
      }
    },
  });

  return new Response(body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function closeListener(listener: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    listener.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function formatHostname(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
}

function writeJsonLog(event: HttpRequestLog): void {
  console.info(JSON.stringify(event));
}
