import type {
  JobCapabilityOperation,
  StarfetchMcpPolicy,
} from "@starfetch-js/mcp";

import type { JobCapabilityCodec } from "./job-capability.js";

const jobCapabilityOperations = [
  "status",
  "wait",
  "fetch",
  "delete",
] as const satisfies readonly JobCapabilityOperation[];

export const hostedPolicyLimits = Object.freeze({
  maxInlineUploadBytes: 1_048_576,
  maxOutboundConcurrency: 4,
  maxRedirects: 3,
  maxRequestBytes: 2_097_152,
  maxResponseBytes: 8_388_608,
  maxrec: 10_000,
  ratePerMinute: 100,
  toolTimeoutMs: 60_000,
  wait: Object.freeze({
    defaultIntervalMs: 2_000,
    defaultTimeoutMs: 30_000,
    maximumIntervalMs: 10_000,
    maximumTimeoutMs: 45_000,
    minimumIntervalMs: 1_000,
  }),
});

export function createHostedStarfetchMcpPolicy(options: {
  jobCapabilities: JobCapabilityCodec;
}): StarfetchMcpPolicy {
  const signal = (incoming: AbortSignal) =>
    AbortSignal.any([
      incoming,
      AbortSignal.timeout(hostedPolicyLimits.toolTimeoutMs),
    ]);

  return {
    authorizeJob(capability, jobUrl, operation) {
      try {
        options.jobCapabilities.verify({ capability, jobUrl, operation });
      } catch {
        throw new HostedMcpPolicyError(
          "CAPABILITY_INVALID",
          "Job capability is missing or invalid.",
        );
      }
    },
    issueJobCapability(jobUrl) {
      return options.jobCapabilities.issue({
        jobUrl,
        operations: jobCapabilityOperations,
      });
    },
    jobAccess: "capability",
    prepareQuery(input) {
      assertUploadsAllowed(input.uploads);
      return {
        maxrec: effectiveMaxrec(input.requestedMaxrec, input.fallbackMaxrec),
        signal: signal(input.incomingSignal),
      };
    },
    prepareRegistry(input) {
      return {
        maxrec: effectiveMaxrec(input.requestedMaxrec, input.fallbackMaxrec),
        signal: signal(input.incomingSignal),
      };
    },
    prepareWait(input, _fallbackTimeoutMs, incomingSignal) {
      const timeoutMs =
        input.timeoutMs ?? hostedPolicyLimits.wait.defaultTimeoutMs;
      assertWaitAllowed(input, timeoutMs);
      return {
        intervalMs:
          input.intervalMs ?? hostedPolicyLimits.wait.defaultIntervalMs,
        maxIntervalMs:
          input.maxIntervalMs ?? hostedPolicyLimits.wait.maximumIntervalMs,
        signal: signal(incomingSignal),
        timeoutMs,
      };
    },
    signal,
  };
}

class HostedMcpPolicyError extends Error {
  override readonly name = "HostedMcpPolicyError";

  constructor(
    readonly code:
      | "CAPABILITY_INVALID"
      | "INLINE_UPLOAD_TOO_LARGE"
      | "MAXREC_EXCEEDED"
      | "REMOTE_UPLOAD_FORBIDDEN"
      | "WAIT_LIMIT_EXCEEDED",
    message: string,
  ) {
    super(`HostedMcpPolicyError[${code}]: ${message}`);
  }
}

function effectiveMaxrec(
  requested: number | undefined,
  fallback: number,
): number {
  const value = requested ?? fallback;
  if (value > hostedPolicyLimits.maxrec) {
    throw new HostedMcpPolicyError(
      "MAXREC_EXCEEDED",
      `maxrec must not exceed ${hostedPolicyLimits.maxrec}.`,
    );
  }
  return value;
}

function assertUploadsAllowed(
  uploads: readonly ({ uri: string } | { votable: string })[] | undefined,
): void {
  if (uploads === undefined) return;

  let inlineBytes = 0;
  for (const upload of uploads) {
    if ("uri" in upload) {
      throw new HostedMcpPolicyError(
        "REMOTE_UPLOAD_FORBIDDEN",
        "Hosted Starfetch does not accept remote TAP upload URIs.",
      );
    }
    inlineBytes += new TextEncoder().encode(upload.votable).byteLength;
  }

  if (inlineBytes > hostedPolicyLimits.maxInlineUploadBytes) {
    throw new HostedMcpPolicyError(
      "INLINE_UPLOAD_TOO_LARGE",
      `Inline TAP uploads must not exceed ${hostedPolicyLimits.maxInlineUploadBytes} bytes in total.`,
    );
  }
}

function assertWaitAllowed(
  input: Readonly<{
    intervalMs?: number | undefined;
    maxIntervalMs?: number | undefined;
  }>,
  timeoutMs: number,
): void {
  const limits = hostedPolicyLimits.wait;
  if (
    timeoutMs > limits.maximumTimeoutMs ||
    (input.intervalMs !== undefined &&
      (input.intervalMs < limits.minimumIntervalMs ||
        input.intervalMs > limits.maximumIntervalMs)) ||
    (input.maxIntervalMs !== undefined &&
      (input.maxIntervalMs < limits.minimumIntervalMs ||
        input.maxIntervalMs > limits.maximumIntervalMs))
  ) {
    throw new HostedMcpPolicyError(
      "WAIT_LIMIT_EXCEEDED",
      "Requested wait settings exceed the hosted policy limits.",
    );
  }
}
