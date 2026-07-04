import { describe, expect, it } from "vitest";

import { createMockTapMetadataFetch } from "../../core/test/mock-tap-metadata.js";
import { createStringWriter } from "../test/string-writer.js";
import { runCli } from "./index.js";

describe("starfetch CLI TAP metadata", () => {
  it("prints metadata commands in tap help", async () => {
    const stdout = createStringWriter();

    expect(await runCli(["tap", "--help"], { stdout: stdout.writer })).toBe(0);
    expect(stdout.text()).toContain("capabilities");
    expect(stdout.text()).toContain("availability");
    expect(stdout.text()).toContain("tables");
    expect(stdout.text()).toContain("columns");
  });

  it("prints capabilities as text and JSON", async () => {
    const textFetch = createMockTapMetadataFetch({
      "/tap/capabilities": "vosi-capabilities-anonymous.xml",
    });
    const jsonFetch = createMockTapMetadataFetch({
      "/tap/capabilities": "vosi-capabilities-anonymous.xml",
    });
    const textStdout = createStringWriter();
    const jsonStdout = createStringWriter();

    expect(
      await runCli(
        ["tap", "capabilities", "--url", "https://example.test/tap"],
        { fetch: textFetch, stdout: textStdout.writer },
      ),
    ).toBe(0);
    expect(textStdout.text()).toBe(
      "auth: anonymous\nlanguages: ADQL, PQL\nformats: votable, csv, tsv\n",
    );

    expect(
      await runCli(
        [
          "tap",
          "capabilities",
          "--url",
          "https://example.test/tap",
          "--format",
          "json",
        ],
        { fetch: jsonFetch, stdout: jsonStdout.writer },
      ),
    ).toBe(0);
    expect(JSON.parse(jsonStdout.text())).toEqual({
      auth: "anonymous",
      formats: ["votable", "csv", "tsv"],
      languages: ["ADQL", "PQL"],
    });
  });

  it("targets a known service preset", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/simbad/sim-tap/tables": "vosi-tables.xml",
    });
    const stdout = createStringWriter();

    expect(
      await runCli(["tap", "tables", "--service", "simbad"], {
        fetch: mockFetch,
        stdout: stdout.writer,
      }),
    ).toBe(0);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://simbad.cds.unistra.fr/simbad/sim-tap/tables",
    );
  });

  it("uses --url as the endpoint when --service is also supplied", async () => {
    const mockFetch = createMockTapMetadataFetch({
      "/tap/tables": "vosi-tables.xml",
    });
    const stdout = createStringWriter();

    expect(
      await runCli(
        [
          "tap",
          "tables",
          "--service",
          "gaia",
          "--url",
          "https://example.test/tap",
        ],
        { fetch: mockFetch, stdout: stdout.writer },
      ),
    ).toBe(0);
    expect(mockFetch.requests[0]?.url.href).toBe(
      "https://example.test/tap/tables",
    );
  });

  it("prints availability as text and JSON", async () => {
    const textFetch = createMockTapMetadataFetch({
      "/tap/availability": "vosi-availability-available.xml",
    });
    const jsonFetch = createMockTapMetadataFetch({
      "/tap/availability": "vosi-availability-available.xml",
    });
    const textStdout = createStringWriter();
    const jsonStdout = createStringWriter();

    expect(
      await runCli(
        ["tap", "availability", "--url", "https://example.test/tap"],
        { fetch: textFetch, stdout: textStdout.writer },
      ),
    ).toBe(0);
    expect(textStdout.text()).toBe(
      "available: true\nmessage: Service is accepting anonymous TAP requests.\n",
    );

    expect(
      await runCli(
        [
          "tap",
          "availability",
          "--url",
          "https://example.test/tap",
          "--format",
          "json",
        ],
        { fetch: jsonFetch, stdout: jsonStdout.writer },
      ),
    ).toBe(0);
    expect(JSON.parse(jsonStdout.text())).toEqual({
      available: true,
      message: "Service is accepting anonymous TAP requests.",
    });
  });

  it("prints tables as text and JSON", async () => {
    const textFetch = createMockTapMetadataFetch({
      "/tap/tables": "vosi-tables.xml",
    });
    const jsonFetch = createMockTapMetadataFetch({
      "/tap/tables": "vosi-tables.xml",
    });
    const textStdout = createStringWriter();
    const jsonStdout = createStringWriter();

    expect(
      await runCli(["tap", "tables", "--url", "https://example.test/tap"], {
        fetch: textFetch,
        stdout: textStdout.writer,
      }),
    ).toBe(0);
    expect(textStdout.text()).toContain(
      "gaiadr3.gaia_source\tgaiadr3\tGaia DR3 source catalog.\n",
    );

    expect(
      await runCli(
        [
          "tap",
          "tables",
          "--url",
          "https://example.test/tap",
          "--format",
          "json",
        ],
        { fetch: jsonFetch, stdout: jsonStdout.writer },
      ),
    ).toBe(0);
    expect(JSON.parse(jsonStdout.text())).toEqual([
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
    ]);
  });

  it("prints columns as text and JSON", async () => {
    const textFetch = createMockTapMetadataFetch({
      "/tap/tables": "vosi-tables.xml",
    });
    const jsonFetch = createMockTapMetadataFetch({
      "/tap/tables": "vosi-tables.xml",
    });
    const textStdout = createStringWriter();
    const jsonStdout = createStringWriter();

    expect(
      await runCli(
        [
          "tap",
          "columns",
          "--url",
          "https://example.test/tap",
          "--table",
          "gaiadr3.gaia_source",
        ],
        { fetch: textFetch, stdout: textStdout.writer },
      ),
    ).toBe(0);
    expect(textStdout.text()).toContain(
      "ra\tDOUBLE\tdeg\tpos.eq.ra;meta.main\tRight ascension.\n",
    );

    expect(
      await runCli(
        [
          "tap",
          "columns",
          "--url",
          "https://example.test/tap",
          "--table",
          "gaiadr3.gaia_source",
          "--format",
          "json",
        ],
        { fetch: jsonFetch, stdout: jsonStdout.writer },
      ),
    ).toBe(0);
    expect(JSON.parse(jsonStdout.text())).toEqual([
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
    ]);
  });

  it("requires a target and --table where appropriate", async () => {
    const tablesStderr = createStringWriter();
    const columnsStderr = createStringWriter();
    const mockFetch = createMockTapMetadataFetch({
      "/tap/tables": "vosi-tables.xml",
    });

    expect(
      await runCli(["tap", "tables"], {
        fetch: mockFetch,
        stderr: tablesStderr.writer,
      }),
    ).toBe(1);
    expect(tablesStderr.text()).toContain("Specify --url or --service.");
    expect(mockFetch.requests).toHaveLength(0);

    expect(
      await runCli(["tap", "columns", "--url", "https://example.test/tap"], {
        fetch: mockFetch,
        stderr: columnsStderr.writer,
      }),
    ).toBe(1);
    expect(columnsStderr.text()).toContain("required option '--table <name>'");
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("rejects unknown service presets without making a request", async () => {
    const stderr = createStringWriter();
    const mockFetch = createMockTapMetadataFetch({
      "/tap/tables": "vosi-tables.xml",
    });

    expect(
      await runCli(["tap", "tables", "--service", "unknown"], {
        fetch: mockFetch,
        stderr: stderr.writer,
      }),
    ).toBe(1);
    expect(stderr.text()).toContain("Unknown TAP service preset: unknown");
    expect(mockFetch.requests).toHaveLength(0);
  });

  it("rejects unsupported metadata formats without making a request", async () => {
    const cases = ["csv", "votable", "jsonl"];

    for (const format of cases) {
      const stderr = createStringWriter();
      const mockFetch = createMockTapMetadataFetch({
        "/tap/tables": "vosi-tables.xml",
      });

      expect(
        await runCli(
          [
            "tap",
            "tables",
            "--url",
            "https://example.test/tap",
            "--format",
            format,
          ],
          { fetch: mockFetch, stderr: stderr.writer },
        ),
      ).toBe(1);
      expect(stderr.text()).toContain(`Unsupported metadata format: ${format}`);
      expect(mockFetch.requests).toHaveLength(0);
    }
  });
});
