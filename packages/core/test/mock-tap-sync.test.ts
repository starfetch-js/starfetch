import { describe, expect, it } from "vitest";

import { createMockTapSyncFetch, readCoreFixture } from "./mock-tap-sync.js";

describe("core TAP sync fixtures", () => {
  it("includes a successful VOTable TABLEDATA result", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");

    expect(fixture).toContain('<INFO name="QUERY_STATUS" value="OK">');
    expect(fixture).toContain("<TABLEDATA>");
    expect(fixture).toContain('<FIELD name="source_id"');
  });

  it("includes TAP error, native CSV, native TSV, and malformed XML examples", async () => {
    await expect(readCoreFixture("sync-error.votable.xml")).resolves.toContain(
      'value="ERROR"',
    );
    await expect(readCoreFixture("native.csv")).resolves.toContain(
      "source_id,ra,dec",
    );
    await expect(readCoreFixture("native.tsv")).resolves.toContain(
      "source_id\tra\tdec",
    );
    await expect(readCoreFixture("malformed.xml")).resolves.toContain(
      "<VOTABLE>",
    );
  });
});

describe("createMockTapSyncFetch", () => {
  it("captures TAP /sync POST form parameters", async () => {
    const mockFetch = createMockTapSyncFetch(
      new Response(
        await readCoreFixture("sync-success-tabledata.votable.xml"),
        {
          headers: { "content-type": "application/x-votable+xml" },
        },
      ),
    );

    const body = new URLSearchParams({
      LANG: "ADQL",
      QUERY: "SELECT TOP 2 source_id FROM mock_source",
      RESPONSEFORMAT: "votable",
    });

    const response = await mockFetch("https://example.test/tap/sync", {
      method: "POST",
      body,
    });

    await expect(response.text()).resolves.toContain("<TABLEDATA>");
    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.requests[0]?.method).toBe("POST");
    expect(mockFetch.requests[0]?.params.get("LANG")).toBe("ADQL");
    expect(mockFetch.requests[0]?.params.get("QUERY")).toBe(
      "SELECT TOP 2 source_id FROM mock_source",
    );
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("votable");
  });

  it("can return capabilities fixtures while keeping sync requests separate", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("sync result"), {
      capabilities: "vosi-capabilities-anonymous.xml",
    });

    const capabilities = await mockFetch(
      "https://example.test/tap/capabilities",
    );
    const sync = await mockFetch("https://example.test/tap/sync", {
      method: "POST",
      body: new URLSearchParams({ LANG: "ADQL", QUERY: "SELECT 1" }),
    });

    await expect(capabilities.text()).resolves.toContain(
      'standardID="ivo://ivoa.net/std/TAP"',
    );
    await expect(sync.text()).resolves.toBe("sync result");
    expect(mockFetch.requests).toHaveLength(1);
    expect(mockFetch.allRequests.map((request) => request.resource)).toEqual([
      "capabilities",
      "sync",
    ]);
  });

  it("can return each first-slice sync fixture body", async () => {
    const cases = [
      ["sync-error.votable.xml", "Syntax error near FROM"],
      ["native.csv", "source_id,ra,dec"],
      ["native.tsv", "source_id\tra\tdec"],
      ["malformed.xml", "<VOTABLE>"],
    ] as const;

    for (const [fixtureName, expectedText] of cases) {
      const mockFetch = createMockTapSyncFetch(
        new Response(await readCoreFixture(fixtureName)),
      );

      const response = await mockFetch("https://example.test/sync", {
        method: "POST",
        body: new URLSearchParams({ LANG: "ADQL", QUERY: "SELECT 1" }),
      });

      await expect(response.text()).resolves.toContain(expectedText);
    }
  });

  it("rejects unexpected TAP paths and methods", async () => {
    const mockFetch = createMockTapSyncFetch(new Response("unused"));

    await expect(
      mockFetch("https://example.test/async", { method: "POST" }),
    ).rejects.toThrow("Expected TAP /sync request");

    await expect(
      mockFetch("https://example.test/sync", { method: "GET" }),
    ).rejects.toThrow("Expected TAP /sync POST");
  });
});
