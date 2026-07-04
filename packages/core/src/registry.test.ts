import { describe, expect, it } from "vitest";

import { readCoreFixture } from "../test/fixtures.js";
import { createMockTapSyncFetch } from "../test/mock-tap-sync.js";
import { registry } from "./index.js";

describe("VO registry discovery", () => {
  it("searches RegTAP for TAP services and returns endpoint metadata", async () => {
    const mockFetch = createMockTapSyncFetch(
      new Response(await readCoreFixture("regtap-search.votable.xml"), {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    const services = await registry({
      fetch: mockFetch,
      registryUrl: "https://registry.example.test/tap",
    }).searchTapServices({ maxrec: 2, query: "gaia" });

    expect(services).toEqual([
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
    ]);

    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://registry.example.test/tap/sync",
    );
    expect(mockFetch.requests[0]?.params.get("LANG")).toBe("ADQL");
    expect(mockFetch.requests[0]?.params.get("RESPONSEFORMAT")).toBe("votable");
    expect(mockFetch.requests[0]?.params.get("MAXREC")).toBe("2");
    expect(mockFetch.requests[0]?.params.get("QUERY")).toContain(
      "standard_id LIKE 'ivo://ivoa.net/std/tap%'",
    );
    expect(mockFetch.requests[0]?.params.get("QUERY")).toContain(
      "ivo_nocasematch(res_title, '%gaia%')",
    );
  });
});
