import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const image =
  process.env.STARFETCH_CONTAINER_IMAGE ?? "starfetch-mcp-app:smoke";
const container = `starfetch-mcp-app-smoke-${process.pid}`;
const capabilitySecret = Buffer.alloc(32, 1).toString("base64url");

try {
  await run("docker", [
    "build",
    "--platform",
    "linux/amd64",
    "--file",
    "apps/mcp-app/Dockerfile",
    "--tag",
    image,
    ".",
  ]);
  await run("docker", [
    "run",
    "--detach",
    "--name",
    container,
    "--env",
    `STARFETCH_JOB_CAPABILITY_SECRET=${capabilitySecret}`,
    "--publish",
    "127.0.0.1::8080",
    image,
  ]);

  const mapping = await output("docker", ["port", container, "8080/tcp"]);
  const port = mapping.trim().match(/:(\d+)$/)?.[1];
  assert.ok(port, `Expected Docker to publish port 8080, received: ${mapping}`);
  const origin = new globalThis.URL(`http://127.0.0.1:${port}`);

  const health = await waitForHealth(origin);
  assert.deepEqual(await health.json(), { status: "ok" });

  const initialized = await globalThis.fetch(
    new globalThis.URL("/mcp", origin),
    {
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "starfetch-container-smoke", version: "0.0.0" },
        },
      }),
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
  assert.equal(initialized.status, 200);
  assert.match(await initialized.text(), /"name":"starfetch"/);

  const listing = await callModernMcp(origin, "skills/list");
  assert.deepEqual(
    listing.skills.map((skill) => skill.uri),
    ["skill://starfetch/SKILL.md"],
  );
  const entry = listing.skills[0];
  const paths = [entry.uri, "skill://starfetch/references/query-safety.md"];
  for (const uri of paths) {
    const file = entry.resources.find((resource) => resource.uri === uri);
    assert.ok(file, `Expected ${uri} in the packed skill manifest`);
    const result = await callModernMcp(origin, "resources/read", { uri });
    const { text } = result.contents[0];
    assert.equal(Buffer.byteLength(text), file.size);
    assert.equal(
      `sha256:${createHash("sha256").update(text).digest("hex")}`,
      file.digest,
    );
  }

  const user = (await output("docker", ["exec", container, "id", "-u"])).trim();
  assert.notEqual(
    user,
    "0",
    "Expected the container to run as a non-root user.",
  );
  await run("docker", [
    "exec",
    container,
    "test",
    "!",
    "-e",
    "/workspace/apps/mcp-app/dist/index.js.map",
  ]);
  await run("docker", [
    "exec",
    container,
    "test",
    "!",
    "-e",
    "/workspace/apps/mcp-app/src",
  ]);
  await run("docker", [
    "exec",
    container,
    "test",
    "!",
    "-e",
    "/workspace/node_modules/typescript",
  ]);
} catch (error) {
  await run("docker", ["logs", container], true);
  throw error;
} finally {
  await run("docker", ["rm", "--force", container], true);
}

async function callModernMcp(origin, method, params = {}) {
  const revision = "2026-07-28";
  const response = await globalThis.fetch(new globalThis.URL("/mcp", origin), {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": revision,
      "mcp-method": method,
      ...(params.uri === undefined ? {} : { "mcp-name": params.uri }),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": revision,
          "io.modelcontextprotocol/clientInfo": {
            name: "starfetch-container-smoke",
            version: "0.0.0",
          },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
  });
  const body = await response.text();
  assert.equal(response.status, 200, body);
  const message = JSON.parse(body.match(/^data: (.+)$/m)?.[1] ?? body);
  assert.ok(message.result, JSON.stringify(message));
  return message.result;
}

async function waitForHealth(origin) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await globalThis.fetch(
        new globalThis.URL("/health", origin),
      );
      if (response.ok) {
        return response;
      }
      lastError = new Error(`Health check returned ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError ?? new Error("Container did not become healthy.");
}

function run(command, args, ignoreFailure = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0 || ignoreFailure) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} exited with code ${String(code)} and signal ${String(signal)}.`,
        ),
      );
    });
  });
}

function output(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          `${command} exited with code ${String(code)} and signal ${String(signal)}.`,
        ),
      );
    });
  });
}
