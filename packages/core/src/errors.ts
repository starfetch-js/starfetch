/** Base class for Starfetch library errors. */
export class StarfetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StarfetchError";
  }
}

/** HTTP-level TAP failure before a TAP service error could be parsed. */
export class TapHttpError extends StarfetchError {
  /** HTTP status code when one was available. */
  readonly status?: number;
  /** HTTP status text when one was available. */
  readonly statusText?: string;

  constructor(
    message: string,
    options: { status?: number; statusText?: string } = {},
  ) {
    super(message);
    this.name = "TapHttpError";

    if (options.status !== undefined) {
      this.status = options.status;
    }

    if (options.statusText !== undefined) {
      this.statusText = options.statusText;
    }
  }
}

/** Error reported by a TAP service response, usually through VOTable INFO. */
export class TapServiceError extends StarfetchError {
  constructor(message: string) {
    super(message);
    this.name = "TapServiceError";
  }
}

/** Requested TAP or local output format cannot be provided safely. */
export class TapFormatUnsupportedError extends StarfetchError {
  constructor(message: string) {
    super(message);
    this.name = "TapFormatUnsupportedError";
  }
}

/** TAP upload request cannot be encoded or validated. */
export class TapUploadError extends StarfetchError {
  constructor(message: string) {
    super(message);
    this.name = "TapUploadError";
  }
}

/** TAP service requires authentication that Starfetch does not support. */
export class TapAuthUnsupportedError extends StarfetchError {
  constructor(message: string) {
    super(message);
    this.name = "TapAuthUnsupportedError";
  }
}

/** TAP metadata, UWS, VOTable, or XML response parsing failed. */
export class TapParseError extends StarfetchError {
  constructor(message: string) {
    super(message);
    this.name = "TapParseError";
  }
}

/** Async TAP job reached a failed terminal UWS phase. */
export class TapJobTerminalError extends StarfetchError {
  /** Last observed terminal status. */
  readonly status: { phase: string };

  constructor(status: { phase: string }) {
    super(`TAP async job reached terminal phase ${status.phase}`);
    this.name = "TapJobTerminalError";
    this.status = status;
  }
}

/** Async TAP job polling exceeded the requested timeout. */
export class TapJobTimeoutError extends StarfetchError {
  /** Timeout in milliseconds that was exceeded. */
  readonly timeoutMs: number;
  /** Last status observed before the timeout, when available. */
  readonly lastStatus?: { phase: string };

  constructor(timeoutMs: number, lastStatus?: { phase: string }) {
    super(`TAP async job wait timed out after ${timeoutMs}ms`);
    this.name = "TapJobTimeoutError";
    this.timeoutMs = timeoutMs;

    if (lastStatus !== undefined) {
      this.lastStatus = lastStatus;
    }
  }
}
