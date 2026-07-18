import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("MCP HTTP executable", () => {
  it("exits cleanly on SIGTERM with an active MCP stream", async () => {
    const { child, origin } = await startExecutable(20);

    try {
      await fetch(new URL("/mcp", origin), {
        headers: { accept: "text/event-stream" },
      });
      child.kill("SIGTERM");

      const [code, signal] = await waitForExit(child, 1_000);
      expect({ code, signal }).toEqual({ code: 0, signal: null });
    } finally {
      await forceExit(child);
    }
  });

  it("forces exit when a second termination signal arrives", async () => {
    const { child, origin } = await startExecutable(1_000);

    try {
      await fetch(new URL("/mcp", origin), {
        headers: { accept: "text/event-stream" },
      });
      child.kill("SIGTERM");
      await delay(20);
      child.kill("SIGINT");

      const [code, signal] = await waitForExit(child, 300);
      expect({ code, signal }).toEqual({ code: 1, signal: null });
    } finally {
      await forceExit(child);
    }
  });
});

async function startExecutable(shutdownGraceMs: number): Promise<{
  child: ReturnType<typeof spawn>;
  origin: string;
}> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./index.ts", import.meta.url))],
    {
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "0",
        SHUTDOWN_GRACE_MS: String(shutdownGraceMs),
        TSX_TSCONFIG_PATH: fileURLToPath(
          new URL("../tsconfig.json", import.meta.url),
        ),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (child.stdout === null || child.stderr === null) {
    throw new Error("Expected the MCP HTTP process to expose output streams.");
  }

  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const [output] = await Promise.race([
    once(child.stdout, "data"),
    once(child, "close").then(([code, signal]) => {
      throw startupError(
        `MCP HTTP process exited before startup (code ${String(code)}, signal ${String(signal)}).`,
        stderr,
      );
    }),
    delay(2_000).then(() => {
      throw startupError("MCP HTTP process did not start.", stderr);
    }),
  ]);
  const started = JSON.parse(String(output)) as {
    event?: unknown;
    origin?: unknown;
  };
  expect(started.event).toBe("mcp_http_started");
  expect(typeof started.origin).toBe("string");

  return { child, origin: String(started.origin) };
}

function waitForExit(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<unknown[]> {
  return Promise.race([
    once(child, "exit"),
    delay(timeoutMs).then(() => {
      throw new Error("MCP HTTP process exceeded its shutdown deadline.");
    }),
  ]);
}

async function forceExit(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function startupError(message: string, stderr: string): Error {
  const detail = stderr.trim();
  return new Error(detail.length === 0 ? message : `${message}\n${detail}`);
}
