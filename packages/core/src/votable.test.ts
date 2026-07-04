import { describe, expect, it } from "vitest";

import {
  parseVotable,
  TapFormatUnsupportedError,
  TapParseError,
} from "./index.js";
import { readCoreFixture } from "../test/fixtures.js";

describe("VOTable TABLEDATA parser", () => {
  it("parses FIELD metadata and TABLEDATA row values", () => {
    const document = parseVotable(`<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE version="1.4" xmlns="http://www.ivoa.net/xml/VOTable/v1.3">
  <RESOURCE type="results">
    <INFO name="QUERY_STATUS" value="OK">Successful query</INFO>
    <TABLE name="mock_result">
      <FIELD ID="source" name="source_id" datatype="long" ucd="meta.id">
        <DESCRIPTION>Gaia source identifier</DESCRIPTION>
      </FIELD>
      <FIELD name="ra" datatype="double" arraysize="1" unit="deg" utype="pos.eq.ra" />
      <FIELD name="flags" datatype="char" arraysize="*" />
      <DATA>
        <TABLEDATA>
          <TR>
            <TD>1001</TD>
            <TD>12.5</TD>
            <TD />
          </TR>
          <TR>
            <TD>1002</TD>
            <TD>13.5</TD>
            <TD>clean</TD>
          </TR>
        </TABLEDATA>
      </DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`);

    expect(document.fields).toEqual([
      {
        id: "source",
        name: "source_id",
        datatype: "long",
        ucd: "meta.id",
        description: "Gaia source identifier",
      },
      {
        name: "ra",
        datatype: "double",
        arraysize: "1",
        unit: "deg",
        utype: "pos.eq.ra",
      },
      {
        name: "flags",
        datatype: "char",
        arraysize: "*",
      },
    ]);
    expect(document.rows).toEqual([
      { source_id: "1001", ra: "12.5", flags: null },
      { source_id: "1002", ra: "13.5", flags: "clean" },
    ]);
    expect(document.queryStatus).toEqual({
      name: "QUERY_STATUS",
      value: "OK",
      message: "Successful query",
    });
  });

  it("records QUERY_STATUS error and overflow INFO elements", () => {
    const document = parseVotable(`<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <INFO name="QUERY_STATUS" value="ERROR">Syntax error near FROM</INFO>
    <INFO name="QUERY_STATUS" value="OVERFLOW">Result truncated</INFO>
    <TABLE>
      <FIELD name="source_id" datatype="long" />
      <DATA><TABLEDATA><TR><TD>1001</TD></TR></TABLEDATA></DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`);

    expect(document.infos).toEqual([
      {
        name: "QUERY_STATUS",
        value: "ERROR",
        message: "Syntax error near FROM",
      },
      {
        name: "QUERY_STATUS",
        value: "OVERFLOW",
        message: "Result truncated",
      },
    ]);
    expect(document.queryStatus).toEqual({
      name: "QUERY_STATUS",
      value: "ERROR",
      message: "Syntax error near FROM",
    });
  });

  it("fails malformed XML and malformed VOTable documents explicitly", () => {
    expect(() => parseVotable("<VOTABLE><RESOURCE>")).toThrow(TapParseError);
    expect(() =>
      parseVotable(`<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <TABLE>
      <DATA><TABLEDATA><TR><TD>1001</TD></TR></TABLEDATA></DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`),
    ).toThrow(TapParseError);
  });

  it("fails unsupported VOTable serializations for row conversion", () => {
    for (const serialization of ["FITS"]) {
      expect(() =>
        parseVotable(`<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <TABLE>
      <FIELD name="source_id" datatype="long" />
      <DATA><${serialization} /></DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`),
      ).toThrow(TapFormatUnsupportedError);
    }
  });

  it("rejects duplicate VOTable FIELD row keys", () => {
    expect(() =>
      parseVotable(`<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <TABLE>
      <FIELD name="source_id" datatype="long" />
      <FIELD name="source_id" datatype="char" arraysize="*" />
      <DATA>
        <TABLEDATA>
          <TR><TD>1001</TD><TD>duplicate</TD></TR>
        </TABLEDATA>
      </DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`),
    ).toThrow("VOTable FIELD key is duplicated: source_id");
  });

  it("parses BINARY row values from inline base64 STREAM data", async () => {
    const document = parseVotable(
      await readCoreFixture("votable-binary-success.xml"),
    );

    expect(document.rows).toEqual([
      { source_id: "1001", ra: "12.5", flag: "ok", quality: "5" },
      { source_id: "1002", ra: "13.5", flag: "bad!", quality: null },
    ]);
  });

  it("parses BINARY2 row values and null flags from inline base64 STREAM data", async () => {
    const document = parseVotable(
      await readCoreFixture("votable-binary2-success.xml"),
    );

    expect(document.rows).toEqual([
      { source_id: "1001", ra: "12.5", flag: null },
      { source_id: "1002", ra: null, flag: "bad!" },
    ]);
  });

  it("parses supported BINARY primitive datatype values", () => {
    const document = parseVotable(`<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <TABLE>
      <FIELD name="ok" datatype="boolean" />
      <FIELD name="bits" datatype="bit" arraysize="5" />
      <FIELD name="byte_value" datatype="unsignedByte" />
      <FIELD name="short_value" datatype="short" />
      <FIELD name="int_value" datatype="int" />
      <FIELD name="long_value" datatype="long" />
      <FIELD name="float_value" datatype="float" />
      <FIELD name="double_value" datatype="double" />
      <FIELD name="float_complex" datatype="floatComplex" />
      <FIELD name="double_complex" datatype="doubleComplex" />
      <FIELD name="ascii" datatype="char" arraysize="4" />
      <FIELD name="unicode" datatype="unicodeChar" arraysize="2" />
      <DATA>
        <BINARY>
          <STREAM encoding="base64">
            VLD///QAAeJAAAABH3H7BMs/wAAAwAIAAAAAAAA/oAAAvwAAAEAEAAAAAAAAwA4AAAAAAABhYgB4AEEDqQ==
          </STREAM>
        </BINARY>
      </DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`);

    expect(document.rows).toEqual([
      {
        ok: "true",
        bits: "10110",
        byte_value: "255",
        short_value: "-12",
        int_value: "123456",
        long_value: "1234567890123",
        float_value: "1.5",
        double_value: "-2.25",
        float_complex: "1.25 -0.5",
        double_complex: "2.5 -3.75",
        ascii: "ab",
        unicode: "A\u03a9",
      },
    ]);
  });

  it("parses BINARY variable-length arrays", () => {
    const document = parseVotable(`<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <TABLE>
      <FIELD name="numbers" datatype="int" arraysize="*" />
      <FIELD name="label" datatype="char" arraysize="*" />
      <DATA>
        <BINARY>
          <STREAM encoding="base64">AAAAAwAAAAEAAAACAAAAAwAAAANoZXk=</STREAM>
        </BINARY>
      </DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`);

    expect(document.rows).toEqual([{ numbers: "1 2 3", label: "hey" }]);
  });

  it("parses scalar BINARY boolean null markers as null", () => {
    const document = parseVotable(`<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <TABLE>
      <FIELD name="ok" datatype="boolean" />
      <DATA>
        <BINARY>
          <STREAM encoding="base64">ACA/</STREAM>
        </BINARY>
      </DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`);

    expect(document.rows).toEqual([{ ok: null }, { ok: null }, { ok: null }]);
  });

  it("rejects BINARY boolean arrays with element-level null markers", () => {
    expect(() =>
      parseVotable(`<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <TABLE>
      <FIELD name="flags" datatype="boolean" arraysize="2" />
      <DATA>
        <BINARY>
          <STREAM encoding="base64">VAA=</STREAM>
        </BINARY>
      </DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`),
    ).toThrow(TapFormatUnsupportedError);
  });

  it("rejects zero-sized BINARY arrays that cannot advance row decoding", () => {
    expect(() =>
      parseVotable(`<?xml version="1.0" encoding="UTF-8"?>
<VOTABLE>
  <RESOURCE type="results">
    <TABLE>
      <FIELD name="empty" datatype="unsignedByte" arraysize="0" />
      <DATA>
        <BINARY>
          <STREAM encoding="base64">AA==</STREAM>
        </BINARY>
      </DATA>
    </TABLE>
  </RESOURCE>
</VOTABLE>`),
    ).toThrow(TapParseError);
  });

  it("fails malformed BINARY and BINARY2 payloads explicitly", async () => {
    const binary = await readCoreFixture("votable-binary-malformed.xml");
    const binary2 = await readCoreFixture("votable-binary2-malformed.xml");

    expect(() => parseVotable(binary)).toThrow(TapParseError);
    expect(() => parseVotable(binary2)).toThrow(TapParseError);
  });
});
