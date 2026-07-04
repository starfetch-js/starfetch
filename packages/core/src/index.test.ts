import { describe, expect, it } from "vitest";

import {
  packageName,
  parseVotable,
  registry,
  StarfetchError,
  tap,
  TapAuthUnsupportedError,
  TapFormatUnsupportedError,
  TapHttpError,
  TapParseError,
  TapServiceError,
} from "./index.js";

describe("@starfetch-js/core", () => {
  it("exposes a minimal scaffold entrypoint", () => {
    expect(packageName).toBe("@starfetch-js/core");
  });

  it("creates a TAP client with normalized target metadata and query support", () => {
    const client = tap("https://example.org/tap/");

    expect(client.target).toEqual({
      baseUrl: "https://example.org/tap",
    });
    expect(client.availability).toEqual(expect.any(Function));
    expect(client.capabilities).toEqual(expect.any(Function));
    expect(client.tables).toEqual(expect.any(Function));
    expect(client.columns).toEqual(expect.any(Function));
    expect(client.query).toEqual(expect.any(Function));
    expect(client.jobs.submit).toEqual(expect.any(Function));
    expect(client.jobs.from).toEqual(expect.any(Function));
  });

  it("exports the public Starfetch error classes", () => {
    expect(new StarfetchError("error")).toBeInstanceOf(Error);
    expect(new TapHttpError("error")).toBeInstanceOf(StarfetchError);
    expect(new TapServiceError("error")).toBeInstanceOf(StarfetchError);
    expect(new TapAuthUnsupportedError("error")).toBeInstanceOf(StarfetchError);
    expect(new TapFormatUnsupportedError("error")).toBeInstanceOf(
      StarfetchError,
    );
    expect(new TapParseError("error")).toBeInstanceOf(StarfetchError);
  });

  it("exports the public VOTable parser", () => {
    expect(parseVotable).toEqual(expect.any(Function));
  });

  it("exports VO registry discovery", () => {
    expect(registry).toEqual(expect.any(Function));
    expect(registry().searchTapServices).toEqual(expect.any(Function));
  });
});
