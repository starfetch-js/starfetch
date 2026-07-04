import { describe, expect, it } from "vitest";

import { readCoreFixture } from "../../core/test/fixtures.js";
import { createMockTapSyncFetch } from "../../core/test/mock-tap-sync.js";
import { createStringWriter } from "../test/string-writer.js";
import { runCli } from "./index.js";

describe("starfetch CLI TAP registry discovery", () => {
  it("prints registry search results as text and JSON", async () => {
    const textFetch = createMockTapSyncFetch(
      new Response(await readCoreFixture("regtap-search.votable.xml"), {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );
    const jsonFetch = createMockTapSyncFetch(
      new Response(await readCoreFixture("regtap-search.votable.xml"), {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );
    const textStdout = createStringWriter();
    const jsonStdout = createStringWriter();

    expect(
      await runCli(["tap", "registry", "search", "gaia", "--maxrec", "2"], {
        fetch: textFetch,
        stdout: textStdout.writer,
      }),
    ).toBe(0);
    expect(textStdout.text()).toContain(
      "Example Gaia TAP\thttps://example.test/tap\tivo://example.test/gaia\tExample registry TAP service.\n",
    );
    expect(textFetch.requests[0]?.params.get("MAXREC")).toBe("2");
    expect(textFetch.requests[0]?.params.get("QUERY")).toContain(
      "ivo_nocasematch(res_title, '%gaia%')",
    );

    expect(
      await runCli(
        [
          "tap",
          "registry",
          "search",
          "gaia",
          "--registry-url",
          "https://registry.example.test/tap",
          "--format",
          "json",
        ],
        { fetch: jsonFetch, stdout: jsonStdout.writer },
      ),
    ).toBe(0);
    expect(jsonFetch.requests[0]?.url.href).toBe(
      "https://registry.example.test/tap/sync",
    );
    expect(JSON.parse(jsonStdout.text())[0]).toEqual({
      accessUrl: "https://example.test/tap",
      description: "Example registry TAP service.",
      ivoid: "ivo://example.test/gaia",
      shortName: "GAIA",
      standardId: "ivo://ivoa.net/std/tap",
      title: "Example Gaia TAP",
    });
  });

  it("rejects invalid registry maxrec before contacting the registry", async () => {
    const mockFetch = createMockTapSyncFetch(new Response(""));
    const stderr = createStringWriter();

    expect(
      await runCli(["tap", "registry", "search", "gaia", "--maxrec", "-1"], {
        fetch: mockFetch,
        stderr: stderr.writer,
      }),
    ).toBe(1);
    expect(stderr.text()).toContain(
      "--maxrec must be a non-negative safe integer.",
    );
    expect(mockFetch.requests).toHaveLength(0);
  });
});
