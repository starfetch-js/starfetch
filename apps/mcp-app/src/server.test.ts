import { request } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { createStarfetchMcpServer } from "@starfetch-js/mcp";
import { describe, expect, it, vi } from "vitest";

import { startStarfetchMcpApp } from "./server.js";

describe("Starfetch MCP HTTP app", () => {
  it.each([
    ["HOST", ""],
    ["PORT", "nope"],
    ["PORT", "65536"],
    ["ALLOWED_ORIGINS", "allowed.example"],
    ["SHUTDOWN_GRACE_MS", "0"],
  ])("rejects invalid %s configuration", async (name, value) => {
    await expect(
      startStarfetchMcpApp({
        HOST: "127.0.0.1",
        PORT: "0",
        [name]: value,
      }),
    ).rejects.toThrow(name);
  });

  it("initializes through Streamable HTTP", async () => {
    const app = await startStarfetchMcpApp({
      HOST: "127.0.0.1",
      PORT: "0",
    });
    const client = new Client({
      name: "starfetch-mcp-app-test",
      version: "0.0.0",
    });

    try {
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL("/mcp", app.origin),
        ) as Transport,
      );

      expect(client.getServerVersion()?.name).toBe("starfetch");
    } finally {
      await client.close();
      await app.close();
    }
  });

  it("serves the canonical Starfetch tools through Streamable HTTP", async () => {
    const app = await startStarfetchMcpApp({
      HOST: "127.0.0.1",
      PORT: "0",
    });
    const client = new Client({
      name: "starfetch-mcp-tool-test",
      version: "0.0.0",
    });

    try {
      await client.connect(
        new StreamableHTTPClientTransport(
          new URL("/mcp", app.origin),
        ) as Transport,
      );

      const tools = await client.listTools();
      const result = await client.callTool({
        name: "starfetch_list_presets",
        arguments: {},
      });

      expect(tools.tools.map((tool) => tool.name)).toContain(
        "starfetch_list_presets",
      );
      expect(result.isError).not.toBe(true);
    } finally {
      await client.close();
      await app.close();
    }
  });

  it("returns an MCP error for malformed JSON-RPC without harming health", async () => {
    const app = await startStarfetchMcpApp({
      HOST: "127.0.0.1",
      PORT: "0",
    });

    try {
      const invalid = await fetch(new URL("/mcp", app.origin), {
        body: "{}",
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        method: "POST",
      });
      const health = await fetch(new URL("/healthz", app.origin));

      expect(invalid.status).toBe(400);
      await expect(invalid.json()).resolves.toMatchObject({
        error: { code: -32_700 },
        id: null,
        jsonrpc: "2.0",
      });
      expect(health.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("accepts stateless MCP DELETE requests", async () => {
    const app = await startStarfetchMcpApp({
      HOST: "127.0.0.1",
      PORT: "0",
    });

    try {
      const response = await fetch(new URL("/mcp", app.origin), {
        method: "DELETE",
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("");
    } finally {
      await app.close();
    }
  });

  it("constructs one fresh canonical MCP server per request", async () => {
    let factoryCount = 0;
    const app = await startStarfetchMcpApp(
      {
        HOST: "127.0.0.1",
        PORT: "0",
      },
      {
        createMcpServer() {
          factoryCount += 1;
          return createStarfetchMcpServer();
        },
      },
    );

    try {
      const first = await fetch(new URL("/mcp", app.origin), {
        method: "DELETE",
      });
      const second = await fetch(new URL("/mcp", app.origin), {
        method: "DELETE",
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(factoryCount).toBe(2);
    } finally {
      await app.close();
    }
  });

  it("reports process health without constructing an MCP server", async () => {
    const app = await startStarfetchMcpApp(
      {
        HOST: "127.0.0.1",
        PORT: "0",
      },
      {
        createMcpServer() {
          throw new Error("Health checks must not construct an MCP server.");
        },
      },
    );

    try {
      const response = await fetch(new URL("/healthz", app.origin));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "ok" });
    } finally {
      await app.close();
    }
  });

  it("closes request-owned MCP resources after the response is consumed", async () => {
    const mcpServer = createStarfetchMcpServer();
    const originalClose = mcpServer.close.bind(mcpServer);
    let closeCount = 0;
    mcpServer.close = async () => {
      closeCount += 1;
      await originalClose();
    };
    const app = await startStarfetchMcpApp(
      {
        HOST: "127.0.0.1",
        PORT: "0",
      },
      {
        createMcpServer: () => mcpServer,
      },
    );

    try {
      const response = await fetch(new URL("/mcp", app.origin), {
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "starfetch-lifecycle-test", version: "0.0.0" },
          },
        }),
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('"name":"starfetch"');
      expect(closeCount).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("preserves a successful response when MCP cleanup fails", async () => {
    const events: unknown[] = [];
    const mcpServer = createStarfetchMcpServer();
    mcpServer.close = async () => {
      throw new Error("private cleanup detail");
    };
    const app = await startStarfetchMcpApp(
      {
        HOST: "127.0.0.1",
        PORT: "0",
      },
      {
        createMcpServer: () => mcpServer,
        writeLog: (event) => events.push(event),
      },
    );

    try {
      const response = await fetch(new URL("/mcp", app.origin), {
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: LATEST_PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "cleanup-failure-test", version: "0.0.0" },
          },
        }),
        headers: {
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
        },
        method: "POST",
      });

      expect(response.status).toBe(200);
      expect(await response.text()).toContain('"name":"starfetch"');
      expect(events).toContainEqual({
        event: "mcp_cleanup_failed",
        requestId: expect.any(String),
      });
      expect(JSON.stringify(events)).not.toContain("private cleanup detail");
    } finally {
      await app.close();
    }
  });

  it("echoes safe request IDs and replaces invalid values", async () => {
    const app = await startStarfetchMcpApp({
      HOST: "127.0.0.1",
      PORT: "0",
    });

    try {
      const accepted = await fetch(new URL("/healthz", app.origin), {
        headers: { "x-request-id": "accepted-request-id" },
      });
      const replaced = await fetch(new URL("/healthz", app.origin), {
        headers: { "x-request-id": "not safe!" },
      });

      expect(accepted.headers.get("x-request-id")).toBe("accepted-request-id");
      expect(replaced.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      await app.close();
    }
  });

  it("answers allowed preflight and rejects disallowed browser origins", async () => {
    const app = await startStarfetchMcpApp(
      {
        ALLOWED_ORIGINS: "https://allowed.example",
        HOST: "127.0.0.1",
        PORT: "0",
      },
      {
        createMcpServer() {
          throw new Error("CORS policy must run before MCP allocation.");
        },
      },
    );

    try {
      const allowed = await fetch(new URL("/mcp", app.origin), {
        headers: {
          origin: "https://allowed.example",
          "access-control-request-headers":
            "content-type,mcp-protocol-version,x-request-id",
          "access-control-request-method": "POST",
        },
        method: "OPTIONS",
      });
      const denied = await fetch(new URL("/healthz", app.origin), {
        headers: { origin: "https://denied.example" },
      });

      expect(allowed.status).toBe(204);
      expect(allowed.headers.get("access-control-allow-origin")).toBe(
        "https://allowed.example",
      );
      expect(allowed.headers.get("access-control-allow-methods")).toBe(
        "GET,POST,DELETE,OPTIONS",
      );
      expect(denied.status).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("rejects foreign Host headers when bound to loopback", async () => {
    const app = await startStarfetchMcpApp({
      HOST: "127.0.0.1",
      PORT: "0",
    });

    try {
      const status = await requestStatus(
        new URL("/healthz", app.origin),
        "attacker.example",
      );

      expect(status).toBe(403);
    } finally {
      await app.close();
    }
  });

  it("emits one bounded request log record", async () => {
    const events: unknown[] = [];
    const app = await startStarfetchMcpApp(
      {
        HOST: "127.0.0.1",
        PORT: "0",
      },
      {
        writeLog: (event) => events.push(event),
      },
    );

    try {
      await fetch(new URL("/healthz?secret=not-logged", app.origin), {
        headers: { "x-request-id": "bounded-log-id" },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        durationMs: expect.any(Number),
        event: "http_request",
        method: "GET",
        path: "/healthz",
        requestId: "bounded-log-id",
        status: 200,
      });
    } finally {
      await app.close();
    }
  });

  it("returns a bounded internal error when MCP setup fails", async () => {
    const mcpServer = createStarfetchMcpServer();
    mcpServer.connect = async () => {
      throw new Error("private setup detail");
    };
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const app = await startStarfetchMcpApp(
      {
        HOST: "127.0.0.1",
        PORT: "0",
      },
      {
        createMcpServer: () => mcpServer,
        writeLog: () => undefined,
      },
    );

    try {
      const response = await fetch(new URL("/mcp", app.origin), {
        method: "DELETE",
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: -32_603,
          message: "Internal server error",
        },
        id: null,
        jsonrpc: "2.0",
      });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      await app.close();
    }
  });

  it("drains an active MCP stream before the shutdown deadline", async () => {
    const mcpServer = createStarfetchMcpServer();
    const originalClose = mcpServer.close.bind(mcpServer);
    let closeCount = 0;
    mcpServer.close = async () => {
      closeCount += 1;
      await originalClose();
    };
    const app = await startStarfetchMcpApp(
      {
        HOST: "127.0.0.1",
        PORT: "0",
        SHUTDOWN_GRACE_MS: "200",
      },
      {
        createMcpServer: () => mcpServer,
      },
    );
    const response = await fetch(new URL("/mcp", app.origin), {
      headers: { accept: "text/event-stream" },
    });
    let shutdownComplete = false;
    const shutdown = app.close().then(() => {
      shutdownComplete = true;
    });

    await delay(20);
    expect(shutdownComplete).toBe(false);
    expect(closeCount).toBe(0);

    await response.body?.cancel();
    await shutdown;
    expect(closeCount).toBe(1);
  });

  it("force-closes an MCP stream after the shutdown deadline", async () => {
    const mcpServer = createStarfetchMcpServer();
    const originalClose = mcpServer.close.bind(mcpServer);
    let closeCount = 0;
    mcpServer.close = async () => {
      closeCount += 1;
      await originalClose();
    };
    const app = await startStarfetchMcpApp(
      {
        HOST: "127.0.0.1",
        PORT: "0",
        SHUTDOWN_GRACE_MS: "20",
      },
      {
        createMcpServer: () => mcpServer,
      },
    );
    await fetch(new URL("/mcp", app.origin), {
      headers: { accept: "text/event-stream" },
    });

    await expect(
      Promise.race([
        app.close(),
        delay(500).then(() => {
          throw new Error("Shutdown exceeded its deadline.");
        }),
      ]),
    ).resolves.toBeUndefined();
    expect(closeCount).toBe(1);
  });

  it("bounds shutdown when MCP cleanup does not settle", async () => {
    const mcpServer = createStarfetchMcpServer();
    let releaseClose: () => void = () => undefined;
    mcpServer.close = () =>
      new Promise<void>((resolve) => {
        releaseClose = resolve;
      });
    const app = await startStarfetchMcpApp(
      {
        HOST: "127.0.0.1",
        PORT: "0",
        SHUTDOWN_GRACE_MS: "20",
      },
      {
        createMcpServer: () => mcpServer,
      },
    );
    await fetch(new URL("/mcp", app.origin), {
      headers: { accept: "text/event-stream" },
    });

    const shutdown = app.close();
    const result = await Promise.race([
      shutdown.then(() => "closed" as const),
      delay(150).then(() => "timed-out" as const),
    ]);
    releaseClose();
    await shutdown;

    expect(result).toBe("closed");
  });

  it("shares one idempotent shutdown operation", async () => {
    const app = await startStarfetchMcpApp({
      HOST: "127.0.0.1",
      PORT: "0",
    });

    const first = app.close();
    const second = app.close();

    expect(second).toBe(first);
    await first;
  });
});

function requestStatus(url: URL, host: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      url,
      {
        headers: { host },
      },
      (incoming) => {
        incoming.resume();
        incoming.once("end", () => resolve(incoming.statusCode));
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
