import { describe, expect, it } from "vitest";

import { TapParseError } from "./errors.js";
import { parseUwsJobStatus } from "./uws-job-status.js";

const jobUrl = new URL("https://example.test/tap/async/job-123");

describe("UWS job status parser", () => {
  it("parses phase and resolves relative primary result links", () => {
    const status = parseUwsJobStatus(
      `
      <uws:job xmlns:uws="http://www.ivoa.net/xml/UWS/v1.0" xmlns:xlink="http://www.w3.org/1999/xlink">
        <uws:phase>COMPLETED</uws:phase>
        <uws:results>
          <uws:result id="result" xlink:href="results/result" />
        </uws:results>
      </uws:job>
      `,
      jobUrl,
    );

    expect(status).toEqual({
      phase: "COMPLETED",
      resultUrl: "https://example.test/tap/async/job-123/results/result",
    });
  });

  it("parses error messages and exposes the standard error URL", () => {
    const status = parseUwsJobStatus(
      `
      <job>
        <phase>ERROR</phase>
        <errorSummary>
          <message>ADQL execution failed</message>
        </errorSummary>
      </job>
      `,
      jobUrl,
    );

    expect(status).toEqual({
      phase: "ERROR",
      errorUrl: "https://example.test/tap/async/job-123/error",
      message: "ADQL execution failed",
    });
  });

  it("rejects UWS job documents without a phase", () => {
    expect(() => parseUwsJobStatus("<job />", jobUrl)).toThrow(TapParseError);
  });
});
