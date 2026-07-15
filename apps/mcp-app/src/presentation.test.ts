import { describe, expect, it } from "vitest";

import {
  createStarfetchTableView,
  STARFETCH_TABLE_VIEW_LIMITS_V1,
  StarfetchPresentationError,
  starfetchTableViewV1Schema,
} from "./presentation.js";

describe("createStarfetchTableView", () => {
  it("normalizes TAP presets through the versioned presentation interface", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_list_presets",
      structuredContent: {
        data: [
          {
            label: "ESA Gaia Archive",
            name: "gaia",
            url: "https://gea.esac.esa.int/tap-server/tap",
          },
          {
            name: "custom",
            syncRequest: "doQuery",
            url: "https://example.test/tap",
          },
        ],
        diagnostics: { count: 2 },
      },
    });

    expect(view).toEqual({
      clipping: {
        reasons: [],
        sourceColumns: 4,
        sourceRows: 2,
      },
      columns: [
        { key: "name", label: "Name" },
        { key: "label", label: "Label" },
        { key: "url", label: "TAP URL" },
        { key: "syncRequest", label: "Sync request" },
      ],
      contractVersion: 1,
      resultKind: "presets",
      rows: [
        {
          label: "ESA Gaia Archive",
          name: "gaia",
          syncRequest: null,
          url: "https://gea.esac.esa.int/tap-server/tap",
        },
        {
          label: null,
          name: "custom",
          syncRequest: "doQuery",
          url: "https://example.test/tap",
        },
      ],
      source: { tool: "starfetch_list_presets" },
      state: "populated",
      title: "Starfetch TAP service presets",
    });
    expect(starfetchTableViewV1Schema.parse(view)).toEqual(view);
    expect(
      new TextEncoder().encode(JSON.stringify(view)).byteLength,
    ).toBeLessThanOrEqual(STARFETCH_TABLE_VIEW_LIMITS_V1.maxSerializedBytes);
  });

  it("normalizes registry matches with registry provenance", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_registry_search",
      structuredContent: {
        data: [
          {
            accessUrl: "https://example.test/tap",
            description: "Example registry TAP service.",
            ivoid: "ivo://example.test/gaia",
            shortName: "GAIA",
            standardId: "ivo://ivoa.net/std/tap",
            title: "Example Gaia TAP",
          },
        ],
        diagnostics: {
          count: 1,
          registryUrl: "https://registry.example.test/tap",
        },
      },
    });

    expect(view).toMatchObject({
      columns: [
        { key: "shortName", label: "Short name" },
        { key: "title", label: "Title" },
        { key: "description", label: "Description" },
        { key: "accessUrl", label: "TAP URL" },
        { key: "ivoid", label: "IVOA identifier" },
        { key: "standardId", label: "Standard identifier" },
      ],
      resultKind: "registry-services",
      rows: [
        {
          accessUrl: "https://example.test/tap",
          description: "Example registry TAP service.",
          ivoid: "ivo://example.test/gaia",
          shortName: "GAIA",
          standardId: "ivo://ivoa.net/std/tap",
          title: "Example Gaia TAP",
        },
      ],
      source: {
        registryUrl: "https://registry.example.test/tap",
        tool: "starfetch_registry_search",
      },
      title: "TAP registry service matches",
    });
    expect(starfetchTableViewV1Schema.parse(view)).toEqual(view);
  });

  it("normalizes TAP tables with target provenance", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_tap_tables",
      structuredContent: {
        data: [
          {
            description: "Gaia DR3 source catalog.",
            name: "gaiadr3.gaia_source",
            schema: "gaiadr3",
          },
        ],
        diagnostics: {
          count: 1,
          target: {
            baseUrl: "https://example.test/tap",
            label: "Example TAP",
            service: "example",
          },
        },
      },
    });

    expect(view).toMatchObject({
      columns: [
        { key: "schema", label: "Schema" },
        { key: "name", label: "Table" },
        { key: "description", label: "Description" },
      ],
      resultKind: "tables",
      rows: [
        {
          description: "Gaia DR3 source catalog.",
          name: "gaiadr3.gaia_source",
          schema: "gaiadr3",
        },
      ],
      source: {
        target: {
          baseUrl: "https://example.test/tap",
          label: "Example TAP",
          service: "example",
        },
        tool: "starfetch_tap_tables",
      },
      title: "Example TAP tables",
    });
  });

  it("normalizes TAP columns without inventing missing metadata", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_tap_columns",
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

    expect(view).toMatchObject({
      columns: [
        { key: "name", label: "Column" },
        { key: "datatype", label: "Datatype" },
        { key: "unit", label: "Unit" },
        { key: "ucd", label: "UCD" },
        { key: "description", label: "Description" },
      ],
      resultKind: "columns",
      rows: [
        {
          datatype: "BIGINT",
          description: "Unique source identifier.",
          name: "source_id",
          ucd: "meta.id;meta.main",
          unit: null,
        },
        {
          datatype: "DOUBLE",
          description: null,
          name: "ra",
          ucd: "pos.eq.ra;meta.main",
          unit: "deg",
        },
      ],
      source: {
        table: "gaiadr3.gaia_source",
        target: { baseUrl: "https://example.test/tap" },
        tool: "starfetch_tap_columns",
      },
      title: "gaiadr3.gaia_source columns",
    });
  });

  it("normalizes sync JSON rows without coercing scientific values", () => {
    const query =
      "SELECT TOP 2 source_id, flux, note, missing FROM catalog.sources";
    const view = createStarfetchTableView({
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: JSON.stringify([
            {
              source_id: "9007199254740993",
              flux: "-0",
              note: 'α "quoted"\nvalue',
              missing: null,
            },
            {
              source_id: "2",
              flux: "1.20e-03",
              note: "",
              missing: null,
            },
          ]),
          fields: [
            { name: "source_id" },
            { name: "flux" },
            { name: "note" },
            { name: "missing" },
          ],
          format: "json",
        },
        diagnostics: {
          durationMs: 1,
          effectiveMaxrec: 2,
          format: "json",
          query,
          requestFormat: "votable",
          runId: "science-run",
          target: {
            baseUrl: "https://example.test/tap",
            label: "Example TAP",
          },
          uploadCount: 0,
        },
      },
    });

    expect(view).toMatchObject({
      columns: [
        { key: "source_id", label: "source_id" },
        { key: "flux", label: "flux" },
        { key: "note", label: "note" },
        { key: "missing", label: "missing" },
      ],
      resultKind: "query-rows",
      rows: [
        {
          flux: "-0",
          missing: null,
          note: 'α "quoted"\nvalue',
          source_id: "9007199254740993",
        },
        {
          flux: "1.20e-03",
          missing: null,
          note: "",
          source_id: "2",
        },
      ],
      source: {
        durationMs: 1,
        effectiveMaxrec: 2,
        format: "json",
        query,
        requestFormat: "votable",
        runId: "science-run",
        target: {
          baseUrl: "https://example.test/tap",
          label: "Example TAP",
        },
        tool: "starfetch_tap_query",
      },
      title: "Example TAP query results",
    });
  });

  it("preserves canonical scientific field order and metadata", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: '[{"10":"ten","2":"two"}]',
          fields: [
            {
              datatype: "long",
              description: "Identifier.",
              name: "10",
              ucd: "meta.id",
            },
            {
              datatype: "double",
              name: "2",
              unit: "deg",
              utype: "example:angle",
            },
          ],
          format: "json",
          overflow: true,
        },
        diagnostics: {
          durationMs: 1,
          effectiveMaxrec: 1,
          format: "json",
          query: 'SELECT "10", "2" FROM numeric_columns',
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    });

    expect(view.columns).toEqual([
      {
        datatype: "long",
        description: "Identifier.",
        key: "10",
        label: "10",
        ucd: "meta.id",
      },
      {
        datatype: "double",
        key: "2",
        label: "2",
        unit: "deg",
        utype: "example:angle",
      },
    ]);
    expect(view.source).toMatchObject({ overflow: true });
  });

  it("rejects scientific rows that do not exactly match canonical fields", () => {
    const createInput = (content: string) => ({
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content,
          fields: [{ name: "source_id" }],
          format: "json",
        },
        diagnostics: {
          durationMs: 1,
          effectiveMaxrec: 1,
          format: "json",
          query: "SELECT TOP 1 source_id FROM catalog.sources",
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    });

    for (const content of ['[{"extra":"value"}]', "[{}]"]) {
      expect(() => createStarfetchTableView(createInput(content))).toThrow(
        expect.objectContaining<Partial<StarfetchPresentationError>>({
          code: "INVALID_SOURCE",
        }),
      );
    }
  });

  it("normalizes async JSON rows without leaking or inventing provenance", () => {
    const view = createStarfetchTableView({
      sourceTool: "starfetch_tap_job_fetch",
      structuredContent: {
        data: {
          content: JSON.stringify([{ source_id: "9007199254740993" }]),
          fields: [{ name: "source_id" }],
          format: "json",
        },
        diagnostics: {
          capability: "signed-secret-value",
          durationMs: 1,
          format: "json",
          job: {
            id: "job-123",
            url: "https://example.test/tap/async/job-123",
          },
          requestFormat: "votable",
          sourceFormat: "csv",
          target: { baseUrl: "https://example.test/tap" },
        },
      },
    });

    expect(view).toMatchObject({
      resultKind: "async-query-rows",
      rows: [{ source_id: "9007199254740993" }],
      source: {
        durationMs: 1,
        format: "json",
        job: {
          id: "job-123",
          url: "https://example.test/tap/async/job-123",
        },
        requestFormat: "votable",
        sourceFormat: "csv",
        target: { baseUrl: "https://example.test/tap" },
        tool: "starfetch_tap_job_fetch",
      },
      title: "https://example.test/tap async job results",
    });
    expect(JSON.stringify(view)).not.toContain("signed-secret-value");
    expect(view.source).not.toHaveProperty("query");
    expect(view.source).not.toHaveProperty("effectiveMaxrec");
  });

  it("distinguishes successful empty results from presentation failures", () => {
    const empty = createStarfetchTableView({
      sourceTool: "starfetch_tap_query",
      structuredContent: {
        data: {
          content: "[]",
          fields: [{ name: "source_id" }],
          format: "json",
        },
        diagnostics: {
          durationMs: 1,
          effectiveMaxrec: 10,
          format: "json",
          query: "SELECT TOP 10 source_id FROM catalog.sources",
          requestFormat: "votable",
          target: { baseUrl: "https://example.test/tap" },
          uploadCount: 0,
        },
      },
    });

    expect(empty).toMatchObject({
      columns: [{ key: "source_id", label: "source_id" }],
      rows: [],
      state: "empty",
    });

    expect(() =>
      createStarfetchTableView({
        sourceTool: "starfetch_tap_query",
        structuredContent: {
          data: {
            content: "not JSON",
            fields: [{ name: "source_id" }],
            format: "json",
          },
          diagnostics: {
            durationMs: 1,
            effectiveMaxrec: 10,
            format: "json",
            query: "SELECT TOP 10 source_id FROM catalog.sources",
            requestFormat: "votable",
            target: { baseUrl: "https://example.test/tap" },
            uploadCount: 0,
          },
        },
      }),
    ).toThrow(
      expect.objectContaining<Partial<StarfetchPresentationError>>({
        code: "INVALID_SOURCE",
      }),
    );

    expect(() =>
      createStarfetchTableView({
        sourceTool: "starfetch_tap_query",
        structuredContent: {
          data: { content: "source_id\n1\n", format: "csv" },
          diagnostics: {
            durationMs: 1,
            effectiveMaxrec: 10,
            format: "csv",
            query: "SELECT TOP 10 source_id FROM catalog.sources",
            requestFormat: "csv",
            target: { baseUrl: "https://example.test/tap" },
            uploadCount: 0,
          },
        },
      }),
    ).toThrow(
      expect.objectContaining<Partial<StarfetchPresentationError>>({
        code: "UNSUPPORTED_FORMAT",
      }),
    );

    for (const data of [
      { content: "[]", format: "json" },
      {
        content: "[]",
        fields: [{ name: "source_id" }],
        format: "json",
      },
    ]) {
      expect(() =>
        createStarfetchTableView({
          sourceTool: "starfetch_tap_query",
          structuredContent: {
            data,
            diagnostics: {
              durationMs: 1,
              effectiveMaxrec: 10,
              format: data.fields === undefined ? "json" : "jsonl",
              query: "SELECT TOP 10 source_id FROM catalog.sources",
              requestFormat: "votable",
              target: { baseUrl: "https://example.test/tap" },
              uploadCount: 0,
            },
          },
        }),
      ).toThrow(
        expect.objectContaining<Partial<StarfetchPresentationError>>({
          code: "INVALID_SOURCE",
        }),
      );
    }
  });
});
