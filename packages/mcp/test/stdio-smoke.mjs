import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = resolve(packageRoot, "dist/index.js");
const { version: packageVersion } = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8"),
);

const client = new Client({
  name: "starfetch-mcp-stdio-smoke",
  version: "0.0.0",
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
    version: packageVersion,
  });
  assert.ok(client.getServerCapabilities()?.tools);
  assert.ok(client.getServerCapabilities()?.prompts);
  assert.ok(client.getServerCapabilities()?.resources);

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

  const prompts = await client.listPrompts();
  assert.deepEqual(prompts.prompts.map((prompt) => prompt.name).sort(), [
    "explore_service",
    "query_astronomy_catalog",
    "run_cone_search",
    "troubleshoot_adql",
  ]);

  const resources = await client.listResources();
  assert.ok(
    resources.resources.some(
      (resource) => resource.uri === "starfetch://guides/adql",
    ),
  );
  const adql = await client.readResource({ uri: "starfetch://guides/adql" });
  assert.match(adql.contents[0].text, /Construct ADQL only after inspecting/);
} finally {
  await client.close();
}

function inputProperties(tools, name) {
  const tool = tools.tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `Expected MCP tool ${name}`);
  assert.ok(tool.inputSchema.properties, `Expected ${name} input properties`);
  return tool.inputSchema.properties;
}
