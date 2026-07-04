import { describe, expect, it } from "vitest";

import {
  TapFormatUnsupportedError,
  TapParseError,
  TapServiceError,
} from "./errors.js";
import {
  createTapResultFromResponse,
  formatTapResult,
} from "./tap-result-output.js";
import { readCoreFixture } from "../test/fixtures.js";

describe("TAP result output conversion", () => {
  it("passes through native CSV, TSV, and VOTable output", async () => {
    const cases = [
      ["csv", "native.csv", "text/csv"],
      ["tsv", "native.tsv", "text/tab-separated-values"],
      [
        "votable",
        "sync-success-tabledata.votable.xml",
        "application/x-votable+xml",
      ],
    ] as const;

    for (const [format, fixtureName, contentType] of cases) {
      const fixture = await readCoreFixture(fixtureName);
      const result = await createTapResultFromResponse(
        format,
        new Response(fixture, {
          headers: { "content-type": contentType },
        }),
      );

      await expect(formatTapResult(result, format)).resolves.toBe(fixture);
    }
  });

  it("converts VOTable TABLEDATA to JSON and JSONL", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");
    const result = await createTapResultFromResponse(
      "votable",
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    await expect(formatTapResult(result, "json")).resolves.toBe(
      `${JSON.stringify(
        [
          { source_id: "1001", ra: "12.5", dec: "-45.25" },
          { source_id: "1002", ra: "13.5", dec: "-44.75" },
        ],
        null,
        2,
      )}\n`,
    );
    await expect(formatTapResult(result, "jsonl")).resolves.toBe(
      [
        '{"source_id":"1001","ra":"12.5","dec":"-45.25"}',
        '{"source_id":"1002","ra":"13.5","dec":"-44.75"}',
        "",
      ].join("\n"),
    );
  });

  it("converts native CSV and TSV rows to JSON and JSONL", async () => {
    const cases = [
      ["csv", "native.csv", "text/csv"],
      ["tsv", "native.tsv", "text/tab-separated-values"],
    ] as const;

    for (const [format, fixtureName, contentType] of cases) {
      const result = await createTapResultFromResponse(
        format,
        new Response(await readCoreFixture(fixtureName), {
          headers: { "content-type": contentType },
        }),
      );

      await expect(formatTapResult(result, "json")).resolves.toBe(
        `${JSON.stringify(
          [
            { source_id: "1001", ra: "12.5", dec: "-45.25" },
            { source_id: "1002", ra: "13.5", dec: "-44.75" },
          ],
          null,
          2,
        )}\n`,
      );
      await expect(formatTapResult(result, "jsonl")).resolves.toBe(
        [
          '{"source_id":"1001","ra":"12.5","dec":"-45.25"}',
          '{"source_id":"1002","ra":"13.5","dec":"-44.75"}',
          "",
        ].join("\n"),
      );
    }
  });

  it("exposes native CSV and TSV rows through TapResult helpers", async () => {
    const cases = [
      ["csv", "native.csv", "text/csv"],
      ["tsv", "native.tsv", "text/tab-separated-values"],
    ] as const;

    for (const [format, fixtureName, contentType] of cases) {
      const result = await createTapResultFromResponse(
        format,
        new Response(await readCoreFixture(fixtureName), {
          headers: { "content-type": contentType },
        }),
      );
      const rows = [];

      for await (const row of result.rows()) {
        rows.push(row);
      }

      expect(rows).toEqual([
        { source_id: "1001", ra: "12.5", dec: "-45.25" },
        { source_id: "1002", ra: "13.5", dec: "-44.75" },
      ]);
      await expect(result.json()).resolves.toEqual(rows);
    }
  });

  it("parses quoted native tabular fields, embedded newlines, and blank rows", async () => {
    const csv = [
      "source_id,label,note,empty_value",
      '1001,"alpha,beta","quoted ""value""",',
      "",
      '1002,"line',
      'break",plain,',
      "",
    ].join("\n");
    const result = await createTapResultFromResponse(
      "csv",
      new Response(csv, { headers: { "content-type": "text/csv" } }),
    );

    await expect(result.json()).resolves.toEqual([
      {
        empty_value: null,
        label: "alpha,beta",
        note: 'quoted "value"',
        source_id: "1001",
      },
      {
        empty_value: null,
        label: "line\nbreak",
        note: "plain",
        source_id: "1002",
      },
    ]);
  });

  it("maps malformed native tabular rows to TAP parse errors", async () => {
    const result = await createTapResultFromResponse(
      "csv",
      new Response(["source_id,ra", "1001,12.5", "1002"].join("\n"), {
        headers: { "content-type": "text/csv" },
      }),
    );

    await expect(formatTapResult(result, "json")).rejects.toThrow(
      TapParseError,
    );
  });

  it("converts VOTable BINARY rows to JSONL and CSV", async () => {
    const fixture = await readCoreFixture("votable-binary-success.xml");
    const result = await createTapResultFromResponse(
      "votable",
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    await expect(formatTapResult(result, "jsonl")).resolves.toBe(
      [
        '{"source_id":"1001","ra":"12.5","flag":"ok","quality":"5"}',
        '{"source_id":"1002","ra":"13.5","flag":"bad!","quality":null}',
        "",
      ].join("\n"),
    );
    await expect(formatTapResult(result, "csv")).resolves.toBe(
      [
        "source_id,ra,flag,quality",
        "1001,12.5,ok,5",
        "1002,13.5,bad!,",
        "",
      ].join("\n"),
    );
  });

  it("exposes VOTable BINARY2 rows through TapResult helpers", async () => {
    const fixture = await readCoreFixture("votable-binary2-success.xml");
    const result = await createTapResultFromResponse(
      "votable",
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    const rows = [];
    for await (const row of result.rows()) {
      rows.push(row);
    }

    expect(rows).toEqual([
      { source_id: "1001", ra: "12.5", flag: null },
      { source_id: "1002", ra: null, flag: "bad!" },
    ]);
    await expect(result.json()).resolves.toEqual(rows);
  });

  it("converts VOTable TABLEDATA to CSV and TSV with stable escaping", async () => {
    const fixture = await readCoreFixture(
      "sync-escaping-tabledata.votable.xml",
    );
    const result = await createTapResultFromResponse(
      "votable",
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    await expect(formatTapResult(result, "csv")).resolves.toBe(
      [
        "source_id,label,note,empty_value,null_like",
        '1001,"alpha,beta","quoted ""value""",,null',
        '1002,tab\tseparated,"line\nbreak",,NULL',
        "",
      ].join("\n"),
    );
    await expect(formatTapResult(result, "tsv")).resolves.toBe(
      [
        "source_id\tlabel\tnote\tempty_value\tnull_like",
        '1001\talpha,beta\t"quoted ""value"""\t\tnull',
        '1002\t"tab\tseparated"\t"line\nbreak"\t\tNULL',
        "",
      ].join("\n"),
    );
  });

  it("converts VOTable responses even when the requested format was native tabular text", async () => {
    const fixture = await readCoreFixture("sync-success-tabledata.votable.xml");
    const result = await createTapResultFromResponse(
      "csv",
      new Response(fixture, {
        headers: { "content-type": "application/x-votable+xml" },
      }),
    );

    await expect(formatTapResult(result, "csv")).resolves.toBe(
      ["source_id,ra,dec", "1001,12.5,-45.25", "1002,13.5,-44.75", ""].join(
        "\n",
      ),
    );
  });

  it("fails unsupported native text conversions clearly", async () => {
    const result = await createTapResultFromResponse(
      "csv",
      new Response(await readCoreFixture("native.csv"), {
        headers: { "content-type": "text/csv" },
      }),
    );

    await expect(formatTapResult(result, "tsv")).rejects.toThrow(
      "Cannot convert csv TAP results to tsv.",
    );
  });

  it("keeps FITS row decoding unsupported and explicit", async () => {
    const result = await createTapResultFromResponse(
      "votable",
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <INFO name="QUERY_STATUS" value="OK" />
    <TABLE>
      <FIELD name="source_id" datatype="long" />
      <DATA><FITS /></DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`,
        { headers: { "content-type": "application/x-votable+xml" } },
      ),
    );

    await expect(formatTapResult(result, "jsonl")).rejects.toThrow(
      TapFormatUnsupportedError,
    );
  });

  it("maps VOTable QUERY_STATUS errors to TAP service errors", async () => {
    await expect(
      createTapResultFromResponse(
        "votable",
        new Response(await readCoreFixture("sync-error.votable.xml"), {
          headers: { "content-type": "application/x-votable+xml" },
        }),
      ),
    ).rejects.toThrow(TapServiceError);
  });
});
