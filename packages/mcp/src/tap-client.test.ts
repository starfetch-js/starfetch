import { describe, expect, it, vi } from "vitest";

import {
  createTapClient,
  createTapJobClient,
  createTapUploads,
} from "./tap-client.js";

describe("MCP TAP client adapter", () => {
  it("creates clients for URL, preset, and preset-qualified URL targets", () => {
    expect(
      createTapClient({ url: "https://example.test/tap/" }, {}).target,
    ).toEqual({ baseUrl: "https://example.test/tap" });
    expect(createTapClient({ service: "gaia" }, {}).target).toMatchObject({
      service: "gaia",
    });
    expect(
      createTapClient(
        { service: "gaia", url: "https://mirror.example/tap" },
        {},
      ).target,
    ).toMatchObject({
      baseUrl: "https://mirror.example/tap",
      service: "gaia",
    });
  });

  it("passes the configured fetch implementation to core", () => {
    const mockFetch = vi.fn<typeof fetch>();

    expect(
      createTapClient({ url: "https://example.test/tap" }, { fetch: mockFetch })
        .options.fetch,
    ).toBe(mockFetch);
  });

  it("rejects a client input without a service or URL", () => {
    expect(() => createTapClient({}, {})).toThrow("Specify service or url.");
  });

  it("derives the TAP target from absolute job URLs", () => {
    const client = createTapJobClient(
      { jobIdOrUrl: "https://example.test/tap/async/job-123" },
      {},
    );

    expect(client.target).toEqual({ baseUrl: "https://example.test/tap" });
  });

  it("uses an explicit target for bare job IDs", () => {
    expect(
      createTapJobClient({ jobIdOrUrl: "job-123", service: "gaia" }, {}).target,
    ).toMatchObject({ service: "gaia" });
  });

  it("rejects a bare job ID without a target", () => {
    expect(() => createTapJobClient({ jobIdOrUrl: "job-123" }, {})).toThrow(
      "Specify service or url when jobIdOrUrl is not absolute.",
    );
  });

  it("preserves remote and inline TAP upload variants", () => {
    expect(createTapUploads(undefined)).toBeUndefined();
    expect(
      createTapUploads([
        { tableName: "remote", uri: "https://example.test/table.xml" },
        { tableName: "inline", votable: "<VOTABLE />" },
        {
          filename: "targets.xml",
          tableName: "named",
          votable: "<VOTABLE />",
        },
      ]),
    ).toEqual([
      { tableName: "remote", uri: "https://example.test/table.xml" },
      { tableName: "inline", votable: "<VOTABLE />" },
      {
        filename: "targets.xml",
        tableName: "named",
        votable: "<VOTABLE />",
      },
    ]);
  });
});
