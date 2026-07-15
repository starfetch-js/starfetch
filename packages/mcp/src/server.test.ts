import { readFileSync } from "node:fs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import {
  createMockTapMetadataFetch,
  readCoreFixture,
} from "../../core/test/mock-tap-metadata.js";
import { createMockTapSyncFetch } from "../../core/test/mock-tap-sync.js";
import {
  createStarfetchMcpServer,
  mcpServerName,
  mcpServerVersion,
  type StarfetchMcpServerOptions,
} from "./server.js";

describe("createStarfetchMcpServer", () => {
  it("advertises the package version", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version?: unknown };

    expect(mcpServerVersion).toBe(packageJson.version);
  });

  it("initializes with metadata and registry tools", async () => {
    await withMcpClient(async (client) => {
      expect(client.getServerVersion()).toEqual({
        name: mcpServerName,
        title: "Starfetch",
        version: mcpServerVersion,
      });
      expect(client.getServerCapabilities()).toHaveProperty("tools");
      expect(client.getServerCapabilities()).toHaveProperty("prompts");
      expect(client.getServerCapabilities()).toHaveProperty("resources");

      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name).sort();

      expect(names).toEqual([
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
      expect(tools.tools.every((tool) => tool.outputSchema !== undefined)).toBe(
        true,
      );
      expect(toolByName(tools, "starfetch_tap_submit_job").annotations).toEqual(
        expect.objectContaining({
          destructiveHint: false,
          idempotentHint: false,
          readOnlyHint: false,
        }),
      );
      expect(toolByName(tools, "starfetch_tap_job_delete").annotations).toEqual(
        expect.objectContaining({
          destructiveHint: true,
          idempotentHint: false,
          readOnlyHint: false,
        }),
      );
      expect(toolByName(tools, "starfetch_tap_job_wait").annotations).toEqual(
        expect.objectContaining({
          destructiveHint: false,
          idempotentHint: true,
          readOnlyHint: true,
        }),
      );
      expect(inputProperties(tools, "starfetch_tap_availability")).toEqual(
        expect.objectContaining({
          service: expect.any(Object),
          url: expect.any(Object),
        }),
      );
      expect(inputProperties(tools, "starfetch_tap_columns")).toEqual(
        expect.objectContaining({
          service: expect.any(Object),
          table: expect.any(Object),
          url: expect.any(Object),
        }),
      );
      expect(inputProperties(tools, "starfetch_tap_query")).toEqual(
        expect.objectContaining({
          format: expect.any(Object),
          maxrec: expect.any(Object),
          query: expect.any(Object),
          service: expect.any(Object),
          url: expect.any(Object),
        }),
      );
      expect(inputProperties(tools, "starfetch_tap_submit_job")).toEqual(
        expect.objectContaining({
          maxrec: expect.any(Object),
          query: expect.any(Object),
          requestFormat: expect.any(Object),
          service: expect.any(Object),
          url: expect.any(Object),
        }),
      );
      expect(inputProperties(tools, "starfetch_tap_job_status")).toEqual(
        expect.objectContaining({
          jobIdOrUrl: expect.any(Object),
          service: expect.any(Object),
          url: expect.any(Object),
        }),
      );
      expect(inputProperties(tools, "starfetch_tap_job_wait")).toEqual(
        expect.objectContaining({
          intervalMs: expect.any(Object),
          jobIdOrUrl: expect.any(Object),
          timeoutMs: expect.any(Object),
        }),
      );
      expect(inputProperties(tools, "starfetch_tap_job_fetch")).toEqual(
        expect.objectContaining({
          format: expect.any(Object),
          jobIdOrUrl: expect.any(Object),
          sourceFormat: expect.any(Object),
        }),
      );
    });
  });

  it("lists built-in TAP service presets as structured content", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        arguments: {},
        name: "starfetch_list_presets",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        data: [
          {
            label: "NASA Exoplanet Archive",
            name: "exoplanetarchive",
            url: "https://exoplanetarchive.ipac.caltech.edu/TAP",
          },
          {
            label: "ESA Gaia Archive",
            name: "gaia",
            url: "https://gea.esac.esa.int/tap-server/tap",
          },
          {
            label: "NASA/IPAC Infrared Science Archive",
            name: "irsa",
            url: "https://irsa.ipac.caltech.edu/TAP",
          },
          {
            label: "SIMBAD",
            name: "simbad",
            syncRequest: "doQuery",
            url: "https://simbad.cds.unistra.fr/simbad/sim-tap",
          },
          {
            label: "VizieR",
            name: "vizier",
            syncRequest: "doQuery",
            url: "https://tapvizier.cds.unistra.fr/TAPVizieR/tap",
          },
        ],
        diagnostics: { count: 5 },
      });
      expect(firstTextContent(result)).toBe(
        JSON.stringify(result.structuredContent),
      );
    });
  });

  it("searches the VO registry with structured diagnostics", async () => {
    const mockFetch = createMockTapSyncFetch(
      new Response(await readCoreFixture("regtap-search.votable.xml"), {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          maxrec: 2,
          query: "gaia",
          registryUrl: "https://registry.example.test/tap",
        },
        name: "starfetch_registry_search",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        data: [
          {
            accessUrl: "https://example.test/tap",
            description: "Example registry TAP service.",
            ivoid: "ivo://example.test/gaia",
            shortName: "GAIA",
            standardId: "ivo://ivoa.net/std/tap",
            title: "Example Gaia TAP",
          },
          {
            accessUrl: "https://simbad.example.test/tap",
            ivoid: "ivo://example.test/simbad",
            standardId: "ivo://ivoa.net/std/tap#aux",
            title: "Example SIMBAD TAP",
          },
        ],
        diagnostics: {
          count: 2,
          registryUrl: "https://registry.example.test/tap",
        },
      });
    });

    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://registry.example.test/tap/sync",
    );
    expect(mockFetch.requests[0]?.params.get("MAXREC")).toBe("2");
  });

  it("reads TAP availability metadata", async () => {
    const mockFetch = createMetadataFetch();

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      await expect(
        client.callTool({
          arguments: { url: "https://example.test/tap" },
          name: "starfetch_tap_availability",
        }),
      ).resolves.toMatchObject({
        structuredContent: {
          data: {
            available: true,
            message: "Service is accepting anonymous TAP requests.",
          },
          diagnostics: {
            target: { baseUrl: "https://example.test/tap" },
          },
        },
      });
    });

    expect(mockFetch.requests.map((request) => request.url.pathname)).toEqual([
      "/tap/availability",
    ]);
  });

  it("reads TAP capabilities metadata", async () => {
    const mockFetch = createMetadataFetch();

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      await expect(
        client.callTool({
          arguments: { url: "https://example.test/tap" },
          name: "starfetch_tap_capabilities",
        }),
      ).resolves.toMatchObject({
        structuredContent: {
          data: {
            auth: "anonymous",
            formats: ["votable", "csv", "tsv"],
            languages: ["ADQL", "PQL"],
          },
          diagnostics: {
            target: { baseUrl: "https://example.test/tap" },
          },
        },
      });
    });

    expect(mockFetch.requests.map((request) => request.url.pathname)).toEqual([
      "/tap/capabilities",
    ]);
  });

  it("lists TAP tables", async () => {
    const mockFetch = createMetadataFetch();

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      await expect(
        client.callTool({
          arguments: { url: "https://example.test/tap" },
          name: "starfetch_tap_tables",
        }),
      ).resolves.toMatchObject({
        structuredContent: {
          data: [
            {
              description: "Gaia DR3 source catalog.",
              name: "gaiadr3.gaia_source",
              schema: "gaiadr3",
            },
            {
              description: "Astrophysical parameters.",
              name: "gaiadr3.astrophysical_parameters",
              schema: "gaiadr3",
            },
          ],
          diagnostics: {
            count: 2,
            target: { baseUrl: "https://example.test/tap" },
          },
        },
      });
    });

    expect(mockFetch.requests.map((request) => request.url.pathname)).toEqual([
      "/tap/tables",
    ]);
  });

  it("lists TAP table columns", async () => {
    const mockFetch = createMetadataFetch();

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      await expect(
        client.callTool({
          arguments: {
            table: "gaiadr3.gaia_source",
            url: "https://example.test/tap",
          },
          name: "starfetch_tap_columns",
        }),
      ).resolves.toMatchObject({
        structuredContent: {
          data: [
            {
              datatype: "BIGINT",
              description: "Unique source identifier.",
              name: "source_id",
              ucd: "meta.id;meta.main",
            },
            {
              datatype: "DOUBLE",
              description: "Right ascension.",
              name: "ra",
              ucd: "pos.eq.ra;meta.main",
              unit: "deg",
            },
          ],
          diagnostics: {
            count: 2,
            table: "gaiadr3.gaia_source",
            target: { baseUrl: "https://example.test/tap" },
          },
        },
      });
    });

    expect(mockFetch.requests.map((request) => request.url.pathname)).toEqual([
      "/tap/tables",
    ]);
  });

  it("runs bounded TAP queries with the default MAXREC", async () => {
    const fixture = await readCoreFixture("native.csv");
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "text/csv" },
      }),
    );

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          format: "csv",
          query: "SELECT TOP 2 source_id, ra, dec FROM mock_source",
          url: "https://example.test/tap",
        },
        name: "starfetch_tap_query",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        data: {
          content: fixture,
          format: "csv",
        },
        diagnostics: {
          durationMs: expect.any(Number),
          effectiveMaxrec: 100,
          format: "csv",
          query: "SELECT TOP 2 source_id, ra, dec FROM mock_source",
          requestFormat: "csv",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      });
      expect(firstTextContent(result)).toBe(
        JSON.stringify(result.structuredContent),
      );
    });

    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/sync",
    );
    expect(mockFetch.requests[0]?.params.get("MAXREC")).toBe("100");
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("csv");
  });

  it("converts VOTable query results to MCP JSON and JSONL output", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");

    for (const format of ["json", "jsonl"] as const) {
      const mockFetch = createMockTapSyncFetch(
        new Response(fixture, {
          headers: { "content-type": "application/x-votable+xml" },
        }),
      );

      await withMcpClient({ fetch: mockFetch }, async (client) => {
        const result = await client.callTool({
          arguments: {
            format,
            maxrec: 2,
            query: "SELECT TOP 2 * FROM mock_source",
            url: "https://example.test/tap",
          },
          name: "starfetch_tap_query",
        });

        expect(result.isError).toBeUndefined();
        expect(result.structuredContent).toMatchObject({
          data: {
            fields: [
              { datatype: "long", name: "source_id" },
              { datatype: "double", name: "ra", unit: "deg" },
              { datatype: "double", name: "dec", unit: "deg" },
            ],
            format,
            overflow: false,
          },
          diagnostics: {
            durationMs: expect.any(Number),
            effectiveMaxrec: 2,
            format,
            query: "SELECT TOP 2 * FROM mock_source",
            requestFormat: "votable",
          },
        });
        expect(
          (result.structuredContent as { data: { content: string } }).data
            .content,
        ).toContain('"source_id"');
      });

      expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe(
        "votable",
      );
    }
  });

  it("forwards explicit TAP query parameters and uploads", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");
    const mockFetch = createMockTapSyncFetch(
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          format: "votable",
          maxrec: 5,
          query: "SELECT * FROM TAP_UPLOAD.targets",
          runId: "starfetch-mcp-sync",
          uploads: [
            {
              filename: "targets.xml",
              tableName: "targets",
              votable: "<VOTABLE />",
            },
            {
              tableName: "remote",
              uri: "https://example.test/remote.votable.xml",
            },
          ],
          url: "https://example.test/tap",
        },
        name: "starfetch_tap_query",
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        diagnostics: {
          effectiveMaxrec: 5,
          runId: "starfetch-mcp-sync",
          uploadCount: 2,
        },
      });
    });

    expect(mockFetch.requests[0]?.formData.get("MAXREC")).toBe("5");
    expect(mockFetch.requests[0]?.formData.get("RUNID")).toBe(
      "starfetch-mcp-sync",
    );
    expect(mockFetch.requests[0]?.body).toContain(
      "targets,param:starfetch_upload_0",
    );
    expect(mockFetch.requests[0]?.body).toContain(
      "remote,https://example.test/remote.votable.xml",
    );
    expect(mockFetch.requests[0]?.formData.get("starfetch_upload_0")).toBe(
      "<VOTABLE />",
    );
  });

  it("rejects invalid TAP query requests before contacting a TAP service", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          format: "csv",
          maxrec: -1,
          query: "SELECT 1",
          url: "https://example.test/tap",
        },
        name: "starfetch_tap_query",
      });

      expect(result.isError).toBe(true);
      expect(firstTextContent(result)).toContain("Invalid arguments");
    });

    expect(mockFetch.requests).toHaveLength(0);

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: {
          format: "votable",
          query: "SELECT * FROM TAP_UPLOAD.bad",
          uploads: [{ tableName: "bad.name", uri: "file:///tmp/bad.xml" }],
          url: "https://example.test/tap",
        },
        name: "starfetch_tap_query",
      });

      expect(result.isError).toBe(true);
      expect(firstTextContent(result)).toContain("TapUploadError:");
    });

    expect(mockFetch.allRequests).toHaveLength(0);
  });

  it("rejects targetless TAP tool calls before contacting a TAP service", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      for (const name of [
        "starfetch_tap_availability",
        "starfetch_tap_capabilities",
        "starfetch_tap_tables",
      ]) {
        const result = await client.callTool({
          arguments: {},
          name,
        });

        expect(result.isError).toBe(true);
        expect(firstTextContent(result)).toContain("Invalid arguments");
      }

      const columns = await client.callTool({
        arguments: { table: "gaiadr3.gaia_source" },
        name: "starfetch_tap_columns",
      });
      expect(columns.isError).toBe(true);
      expect(firstTextContent(columns)).toContain("Invalid arguments");

      const query = await client.callTool({
        arguments: { format: "json", query: "SELECT 1" },
        name: "starfetch_tap_query",
      });
      expect(query.isError).toBe(true);
      expect(firstTextContent(query)).toContain("Invalid arguments");
    });

    expect(mockFetch.allRequests).toHaveLength(0);
  });

  it("maps Starfetch errors to MCP tool execution errors", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/availability": "malformed.xml",
    });

    await withMcpClient({ fetch: mockFetch }, async (client) => {
      const result = await client.callTool({
        arguments: { url: "https://example.test/tap" },
        name: "starfetch_tap_availability",
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      expect(firstTextContent(result)).toContain("TapParseError:");
    });
  });
});

function createMetadataFetch(): ReturnType<typeof createMockTapMetadataFetch> {
  return createMockTapMetadataFetch({
    "/tap/availability": "vosi-availability-available.xml",
    "/tap/capabilities": "vosi-capabilities-anonymous.xml",
    "/tap/tables": "vosi-tables.xml",
  });
}

async function withMcpClient<T>(
  callback: (client: Client) => Promise<T>,
): Promise<T>;
async function withMcpClient<T>(
  options: StarfetchMcpServerOptions,
  callback: (client: Client) => Promise<T>,
): Promise<T>;
async function withMcpClient<T>(
  optionsOrCallback:
    | StarfetchMcpServerOptions
    | ((client: Client) => Promise<T>),
  callback?: (client: Client) => Promise<T>,
): Promise<T> {
  const options =
    typeof optionsOrCallback === "function" ? {} : optionsOrCallback;
  const run =
    typeof optionsOrCallback === "function" ? optionsOrCallback : callback;

  if (run === undefined) {
    throw new Error("MCP client callback is required");
  }

  const server = createStarfetchMcpServer(options);
  const client = new Client({
    name: "starfetch-mcp-test",
    version: "0.1.1",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    return await run(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function firstTextContent(result: unknown): string {
  const { content } = result as { content: unknown };
  const [first] = content as Array<{ text?: unknown; type?: unknown }>;

  if (first?.type !== "text" || typeof first.text !== "string") {
    throw new Error("Expected first MCP content item to be text");
  }

  return first.text;
}

function inputProperties(
  tools: Awaited<ReturnType<Client["listTools"]>>,
  name: string,
): Record<string, unknown> {
  const tool = toolByName(tools, name);
  const properties = tool.inputSchema.properties;

  if (properties === undefined) {
    throw new Error(`Expected MCP tool ${name} to expose input properties`);
  }

  return properties;
}

function toolByName(
  tools: Awaited<ReturnType<Client["listTools"]>>,
  name: string,
): Awaited<ReturnType<Client["listTools"]>>["tools"][number] {
  const tool = tools.tools.find((candidate) => candidate.name === name);

  if (tool === undefined) {
    throw new Error(`Expected MCP tool ${name}`);
  }

  return tool;
}
