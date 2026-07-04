import { describe, expect, it } from "vitest";

import { resolveTapTarget } from "./target-resolver.js";

describe("resolveTapTarget", () => {
  it("normalizes string TAP base URLs", () => {
    expect(resolveTapTarget("https://example.org/tap/")).toEqual({
      baseUrl: "https://example.org/tap",
    });
  });

  it("normalizes object URL targets to the same shape", () => {
    expect(resolveTapTarget({ url: "https://example.org/tap" })).toEqual({
      baseUrl: "https://example.org/tap",
    });
  });

  it("uses url as the endpoint and preserves service metadata", () => {
    expect(
      resolveTapTarget({
        service: "gaia",
        url: "https://example.org/tap",
      }),
    ).toEqual({
      baseUrl: "https://example.org/tap",
      service: "gaia",
      label: "ESA Gaia Archive",
    });
  });

  it("does not apply preset request quirks when url overrides the endpoint", () => {
    expect(
      resolveTapTarget({
        service: "simbad",
        url: "https://example.org/tap",
      }),
    ).toEqual({
      baseUrl: "https://example.org/tap",
      service: "simbad",
      label: "SIMBAD",
    });
  });

  it("resolves default service presets", () => {
    expect(resolveTapTarget("gaia")).toEqual({
      baseUrl: "https://gea.esac.esa.int/tap-server/tap",
      service: "gaia",
      label: "ESA Gaia Archive",
    });
    expect(resolveTapTarget({ service: "simbad" })).toEqual({
      baseUrl: "https://simbad.cds.unistra.fr/simbad/sim-tap",
      service: "simbad",
      label: "SIMBAD",
      syncRequest: "doQuery",
    });
    expect(resolveTapTarget("vizier")).toEqual({
      baseUrl: "https://tapvizier.cds.unistra.fr/TAPVizieR/tap",
      service: "vizier",
      label: "VizieR",
      syncRequest: "doQuery",
    });
    expect(resolveTapTarget("exoplanetarchive")).toEqual({
      baseUrl: "https://exoplanetarchive.ipac.caltech.edu/TAP",
      service: "exoplanetarchive",
      label: "NASA Exoplanet Archive",
    });
    expect(resolveTapTarget("irsa")).toEqual({
      baseUrl: "https://irsa.ipac.caltech.edu/TAP",
      service: "irsa",
      label: "NASA/IPAC Infrared Science Archive",
    });
  });

  it("resolves injected service presets", () => {
    expect(
      resolveTapTarget("mock", {
        presets: {
          mock: {
            name: "mock",
            url: "https://example.org/mock-tap/",
            label: "Mock TAP",
          },
        },
      }),
    ).toEqual({
      baseUrl: "https://example.org/mock-tap",
      service: "mock",
      label: "Mock TAP",
    });
  });

  it("fails clearly for unknown service names", () => {
    expect(() => resolveTapTarget("unknown")).toThrow(
      "Unknown TAP service preset: unknown",
    );
    expect(() => resolveTapTarget({ service: "unknown" })).toThrow(
      "Unknown TAP service preset: unknown",
    );
    expect(() =>
      resolveTapTarget({
        service: "unknown",
        url: "https://example.org/tap",
      }),
    ).toThrow("Unknown TAP service preset: unknown");
  });

  it("fails clearly for malformed and unsupported URLs", () => {
    expect(() => resolveTapTarget("https://")).toThrow("Invalid TAP base URL");
    expect(() => resolveTapTarget("ftp://example.org/tap")).toThrow(
      "Unsupported TAP base URL protocol: ftp:",
    );
    expect(() => resolveTapTarget("https://example.org/tap?x=1")).toThrow(
      "TAP base URL must not include query strings or fragments",
    );
    expect(() => resolveTapTarget("https://example.org/tap#sync")).toThrow(
      "TAP base URL must not include query strings or fragments",
    );
  });
});
