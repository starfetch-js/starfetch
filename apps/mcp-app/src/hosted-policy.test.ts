import { describe, expect, it } from "vitest";

import { createJobCapabilityIssuer } from "./job-capability.js";
import {
  createHostedStarfetchMcpPolicy,
  hostedPolicyLimits,
} from "./hosted-policy.js";

describe("hosted MCP execution policy", () => {
  const policy = createHostedStarfetchMcpPolicy({
    jobCapabilities: createJobCapabilityIssuer({
      secret: new Uint8Array(32).fill(3),
    }),
  });
  const incomingSignal = new AbortController().signal;

  it("enforces the fixed row, upload, and wait limits", () => {
    expect(() =>
      policy.prepareQuery({
        fallbackMaxrec: 100,
        incomingSignal,
        requestedMaxrec: hostedPolicyLimits.maxrec + 1,
        uploads: undefined,
      }),
    ).toThrow("MAXREC_EXCEEDED");
    expect(() =>
      policy.prepareQuery({
        fallbackMaxrec: 100,
        incomingSignal,
        requestedMaxrec: undefined,
        uploads: [{ uri: "https://example.test/upload.xml" }],
      }),
    ).toThrow("REMOTE_UPLOAD_FORBIDDEN");
    expect(() =>
      policy.prepareWait(
        { timeoutMs: hostedPolicyLimits.wait.maximumTimeoutMs + 1 },
        120_000,
        incomingSignal,
      ),
    ).toThrow("WAIT_LIMIT_EXCEEDED");
  });

  it("uses each tool's fallback while allowing table queries up to 10,000 rows", () => {
    expect(
      policy.prepareQuery({
        fallbackMaxrec: 1_000,
        incomingSignal,
        requestedMaxrec: undefined,
        uploads: undefined,
      }).maxrec,
    ).toBe(1_000);
    expect(
      policy.prepareQuery({
        fallbackMaxrec: 100,
        incomingSignal,
        requestedMaxrec: 10_000,
        uploads: undefined,
      }).maxrec,
    ).toBe(10_000);
  });

  it("issues non-expiring capabilities bound to one job", () => {
    const jobUrl = "https://example.test/tap/async/job-1";
    const capability = policy.issueJobCapability(jobUrl);

    expect(capability).toEqual(expect.any(String));
    expect(() =>
      policy.authorizeJob(capability, jobUrl, "status"),
    ).not.toThrow();
    expect(() =>
      policy.authorizeJob(
        capability,
        "https://example.test/tap/async/job-2",
        "status",
      ),
    ).toThrow("CAPABILITY_INVALID");
  });
});
