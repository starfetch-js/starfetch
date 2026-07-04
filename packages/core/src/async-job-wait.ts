import {
  TapHttpError,
  TapJobTerminalError,
  TapJobTimeoutError,
} from "./errors.js";
import type { TapJobStatus } from "./uws-job-status.js";

type WaitDeadline = {
  expiresAt: number;
  timeoutMs: number;
};

/** Options for polling a TAP UWS async job until it completes. */
export type TapJobWaitOptions = {
  /** Initial poll interval in milliseconds; defaults to `2000`. */
  intervalMs?: number;
  /** Maximum time to wait in milliseconds; defaults to no deadline. */
  timeoutMs?: number;
  /** Double the interval after each poll until `maxIntervalMs`. */
  backoff?: boolean;
  /** Maximum poll interval when `backoff` is enabled; defaults to `30000`. */
  maxIntervalMs?: number;
  /** Abort signal for polling and sleep intervals. */
  signal?: AbortSignal;
  /** Called when the observed UWS phase changes. */
  onProgress?: (status: TapJobStatus) => void | Promise<void>;
};

/**
 * Poll a TAP UWS job status reader until completion.
 *
 * @throws TapJobTerminalError for failed terminal phases.
 * @throws TapJobTimeoutError when `timeoutMs` is exceeded.
 */
export async function waitForTapJob(
  readStatus: (signal?: AbortSignal) => Promise<TapJobStatus>,
  options: TapJobWaitOptions,
): Promise<TapJobStatus> {
  const intervalMs = options.intervalMs ?? 2000;
  const timeoutMs = options.timeoutMs;
  const maxIntervalMs = options.maxIntervalMs ?? 30000;
  validateWaitOptions(intervalMs, timeoutMs, maxIntervalMs);

  const deadline =
    timeoutMs === undefined
      ? undefined
      : { expiresAt: Date.now() + timeoutMs, timeoutMs };
  let nextIntervalMs = intervalMs;
  let lastPhase: string | undefined;
  let lastStatus: TapJobStatus | undefined;

  while (true) {
    throwIfAborted(options.signal);

    const status = await readStatus(options.signal);
    lastStatus = status;

    if (status.phase !== lastPhase) {
      lastPhase = status.phase;
      await options.onProgress?.(status);
    }

    if (status.phase === "COMPLETED") {
      return status;
    }

    if (isFailedTerminalPhase(status.phase)) {
      throw new TapJobTerminalError(status);
    }

    if (deadline !== undefined && Date.now() >= deadline.expiresAt) {
      throw new TapJobTimeoutError(deadline.timeoutMs, lastStatus);
    }

    const waitMs = nextWaitMs(nextIntervalMs, deadline);
    await sleep(waitMs, options.signal);

    if (options.backoff === true) {
      nextIntervalMs = Math.min(nextIntervalMs * 2, maxIntervalMs);
    }
  }
}

function validateWaitOptions(
  intervalMs: number,
  timeoutMs: number | undefined,
  maxIntervalMs: number,
): void {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) {
    throw new TapHttpError(
      "TAP async wait interval must be a non-negative safe integer.",
    );
  }

  if (
    timeoutMs !== undefined &&
    (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0)
  ) {
    throw new TapHttpError(
      "TAP async wait timeout must be a non-negative safe integer.",
    );
  }

  if (!Number.isSafeInteger(maxIntervalMs) || maxIntervalMs < 0) {
    throw new TapHttpError(
      "TAP async wait maximum interval must be a non-negative safe integer.",
    );
  }
}

function isFailedTerminalPhase(phase: string): boolean {
  return phase === "ERROR" || phase === "ABORTED" || phase === "ARCHIVED";
}

function nextWaitMs(
  intervalMs: number,
  deadline: WaitDeadline | undefined,
): number {
  if (deadline === undefined) {
    return intervalMs;
  }

  return Math.max(0, Math.min(intervalMs, deadline.expiresAt - Date.now()));
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  throwIfAborted(signal);

  if (ms === 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(cleanupAndResolve, ms);

    function cleanupAndResolve(): void {
      cleanup();
      resolve();
    }

    function cleanupAndReject(): void {
      cleanup();
      reject(abortError(signal));
    }

    function cleanup(): void {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cleanupAndReject);
    }

    signal?.addEventListener("abort", cleanupAndReject, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw abortError(signal);
  }
}

function abortError(signal: AbortSignal | undefined): Error {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }

  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}
