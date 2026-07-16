export type JobCapabilityOperation = "delete" | "fetch" | "status" | "wait";

type UploadInput = readonly ({ uri: string } | { votable: string })[];
type WaitInput = Readonly<{
  intervalMs?: number | undefined;
  maxIntervalMs?: number | undefined;
  timeoutMs?: number | undefined;
}>;

export type StarfetchMcpPolicy = Readonly<{
  authorizeJob(
    capability: string | undefined,
    jobUrl: string,
    operation: JobCapabilityOperation,
  ): void;
  issueJobCapability(jobUrl: string): string | undefined;
  jobAccess: "capability" | "unrestricted";
  prepareQuery(input: {
    fallbackMaxrec: number;
    incomingSignal: AbortSignal;
    requestedMaxrec: number | undefined;
    uploads: UploadInput | undefined;
  }): { maxrec: number; signal: AbortSignal };
  prepareRegistry(input: {
    fallbackMaxrec: number;
    incomingSignal: AbortSignal;
    requestedMaxrec: number | undefined;
  }): { maxrec?: number; signal: AbortSignal };
  prepareWait(
    input: WaitInput,
    fallbackTimeoutMs: number,
    incomingSignal: AbortSignal,
  ): {
    intervalMs?: number;
    maxIntervalMs?: number;
    signal: AbortSignal;
    timeoutMs: number;
  };
  signal(incoming: AbortSignal): AbortSignal;
}>;

export const unrestrictedStarfetchMcpPolicy: StarfetchMcpPolicy = {
  authorizeJob() {},
  issueJobCapability() {
    return undefined;
  },
  jobAccess: "unrestricted",
  prepareQuery(input) {
    return {
      maxrec: input.requestedMaxrec ?? input.fallbackMaxrec,
      signal: input.incomingSignal,
    };
  },
  prepareRegistry(input) {
    return {
      ...(input.requestedMaxrec === undefined
        ? {}
        : { maxrec: input.requestedMaxrec }),
      signal: input.incomingSignal,
    };
  },
  prepareWait(input, fallbackTimeoutMs, incomingSignal) {
    return {
      ...(input.intervalMs === undefined
        ? {}
        : { intervalMs: input.intervalMs }),
      ...(input.maxIntervalMs === undefined
        ? {}
        : { maxIntervalMs: input.maxIntervalMs }),
      signal: incomingSignal,
      timeoutMs: input.timeoutMs ?? fallbackTimeoutMs,
    };
  },
  signal(incoming) {
    return incoming;
  },
};
