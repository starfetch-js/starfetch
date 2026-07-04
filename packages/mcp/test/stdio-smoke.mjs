import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = resolve(packageRoot, "dist/index.js");

const client = new Client({
  name: "starfetch-mcp-stdio-smoke",
  version: "0.1.1",
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  stderr: "pipe",
});

try {
  await client.connect(transport);
  assert.deepEqual(client.getServerVersion(), {
    name: "starfetch",
    title: "Starfetch",
    version: "0.1.1",
  });
  assert.ok(client.getServerCapabilities()?.tools);

  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
    "starfetch_list_presets",
    "starfetch_registry_search",
    "starfetch_tap_availability",
    "starfetch_tap_capabilities",
    "starfetch_tap_columns",
    "starfetch_tap_job_delete",
    "starfetch_tap_job_fetch",
    "starfetch_tap_job_status",
    "starfetch_tap_job_wait",
    "starfetch_tap_query",
    "starfetch_tap_submit_job",
    "starfetch_tap_tables",
  ]);
  assert.deepEqual(
    Object.keys(inputProperties(tools, "starfetch_tap_availability")).sort(),
    ["service", "url"],
  );
  assert.deepEqual(
    Object.keys(inputProperties(tools, "starfetch_tap_columns")).sort(),
    ["service", "table", "url"],
  );
  assert.deepEqual(
    Object.keys(inputProperties(tools, "starfetch_tap_query")).sort(),
    ["format", "maxrec", "query", "runId", "service", "uploads", "url"],
  );
  assert.deepEqual(
    Object.keys(inputProperties(tools, "starfetch_tap_submit_job")).sort(),
    ["maxrec", "query", "requestFormat", "runId", "service", "uploads", "url"],
  );
  assert.deepEqual(
    Object.keys(inputProperties(tools, "starfetch_tap_job_status")).sort(),
    ["jobIdOrUrl", "service", "url"],
  );
  assert.deepEqual(
    Object.keys(inputProperties(tools, "starfetch_tap_job_wait")).sort(),
    [
      "backoff",
      "intervalMs",
      "jobIdOrUrl",
      "maxIntervalMs",
      "service",
      "timeoutMs",
      "url",
    ],
  );
  assert.deepEqual(
    Object.keys(inputProperties(tools, "starfetch_tap_job_fetch")).sort(),
    ["format", "jobIdOrUrl", "service", "sourceFormat", "url"],
  );
  assert.deepEqual(
    Object.keys(inputProperties(tools, "starfetch_tap_job_delete")).sort(),
    ["jobIdOrUrl", "service", "url"],
  );

  const presets = await client.callTool({
    name: "starfetch_list_presets",
    arguments: {},
  });
  assert.equal(presets.isError, undefined);
  assert.equal(presets.structuredContent.diagnostics.count, 5);
} finally {
  await client.close();
}

function inputProperties(tools, name) {
  const tool = tools.tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `Expected MCP tool ${name}`);
  assert.ok(tool.inputSchema.properties, `Expected ${name} input properties`);
  return tool.inputSchema.properties;
}
