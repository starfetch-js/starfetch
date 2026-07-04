import { describe, expect, it } from "vitest";

import { TapUploadError } from "./errors.js";
import { buildTapQueryBody, buildTapQueryParams } from "./tap-params.js";

describe("buildTapQueryParams", () => {
  it("defaults LANG to ADQL and includes QUERY", () => {
    const params = buildTapQueryParams("SELECT TOP 1 * FROM mock_source");

    expect(params.get("LANG")).toBe("ADQL");
    expect(params.get("QUERY")).toBe("SELECT TOP 1 * FROM mock_source");
    expect(params.has("RESPONSEFORMAT")).toBe(false);
  });

  it("adds requested RESPONSEFORMAT", () => {
    const params = buildTapQueryParams("SELECT * FROM mock_source", {
      format: "csv",
    });

    expect(params.get("RESPONSEFORMAT")).toBe("csv");
  });

  it("adds requested TAP request parameters", () => {
    const params = buildTapQueryParams("SELECT * FROM mock_source", {
      maxrec: 10,
      runId: "starfetch-test",
    });

    expect(params.get("MAXREC")).toBe("10");
    expect(params.get("RUNID")).toBe("starfetch-test");
  });

  it("adds URI upload parameters", () => {
    const params = buildTapQueryParams("SELECT * FROM TAP_UPLOAD.targets", {
      uploads: [
        {
          tableName: "targets",
          uri: "https://example.test/targets.votable.xml",
        },
        {
          tableName: "vos_targets",
          uri: "vos://space/targets.votable.xml",
        },
      ],
    });

    expect(params.getAll("UPLOAD")).toEqual([
      "targets,https://example.test/targets.votable.xml",
      "vos_targets,vos://space/targets.votable.xml",
    ]);
  });

  it("builds multipart query bodies for inline VOTable uploads", async () => {
    const body = buildTapQueryBody("SELECT * FROM TAP_UPLOAD.targets", {
      uploads: [
        {
          tableName: "targets",
          votable: "<VOTABLE />",
          filename: "targets.xml",
        },
      ],
    });

    expect(body).toBeInstanceOf(FormData);
    expect(body.get("LANG")).toBe("ADQL");
    expect(body.get("QUERY")).toBe("SELECT * FROM TAP_UPLOAD.targets");
    expect(body.get("UPLOAD")).toBe("targets,param:starfetch_upload_0");

    const uploadPart = body.get("starfetch_upload_0");
    expect(uploadPart).toBeInstanceOf(Blob);
    await expect((uploadPart as Blob).text()).resolves.toBe("<VOTABLE />");
  });

  it("rejects malformed upload inputs", () => {
    expect(() =>
      buildTapQueryParams("SELECT 1", {
        uploads: [{ tableName: "bad.name", uri: "https://example.test/a.xml" }],
      }),
    ).toThrow(TapUploadError);

    expect(() =>
      buildTapQueryParams("SELECT 1", {
        uploads: [
          { tableName: "targets", uri: "https://example.test/a.xml" },
          { tableName: "TARGETS", uri: "https://example.test/b.xml" },
        ],
      }),
    ).toThrow("Duplicate TAP upload table name");

    expect(() =>
      buildTapQueryParams("SELECT 1", {
        uploads: [{ tableName: "targets", uri: "file:///tmp/a.xml" }],
      }),
    ).toThrow("Unsupported TAP upload URI scheme");
  });

  it("uses URLSearchParams encoding for TAP form bodies", () => {
    const params = buildTapQueryParams("SELECT * FROM t WHERE name = 'a b'", {
      format: "votable",
    });

    expect(params.toString()).toBe(
      "LANG=ADQL&QUERY=SELECT+*+FROM+t+WHERE+name+%3D+%27a+b%27&RESPONSEFORMAT=votable",
    );
  });
});
