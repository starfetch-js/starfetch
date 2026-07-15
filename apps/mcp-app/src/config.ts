export type Environment = Readonly<Record<string, string | undefined>>;

export type HttpConfig = Readonly<{
  allowedOrigins: ReadonlySet<string>;
  host: string;
  port: number;
  shutdownGraceMs: number;
}>;

export function loadHttpConfig(environment: Environment): HttpConfig {
  return {
    allowedOrigins: parseAllowedOrigins(environment.ALLOWED_ORIGINS),
    host: parseHost(environment.HOST),
    port: parsePort(environment.PORT),
    shutdownGraceMs: parseShutdownGrace(environment.SHUTDOWN_GRACE_MS),
  };
}

function parsePort(value: string | undefined): number {
  if (value === undefined) {
    return 3000;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error("PORT must be an integer between 0 and 65535.");
  }

  return port;
}

function parseHost(value: string | undefined): string {
  if (value === undefined) {
    return "127.0.0.1";
  }

  if (value === "" || value !== value.trim()) {
    throw new Error("HOST must be a non-empty hostname or IP address.");
  }

  return value;
}

function parseShutdownGrace(value: string | undefined): number {
  if (value === undefined) {
    return 10_000;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error(
      "SHUTDOWN_GRACE_MS must be an integer between 1 and 60000.",
    );
  }

  const milliseconds = Number(value);
  if (
    !Number.isSafeInteger(milliseconds) ||
    milliseconds < 1 ||
    milliseconds > 60_000
  ) {
    throw new Error(
      "SHUTDOWN_GRACE_MS must be an integer between 1 and 60000.",
    );
  }

  return milliseconds;
}

function parseAllowedOrigins(value: string | undefined): Set<string> {
  if (value === undefined || value.trim() === "") {
    return new Set();
  }

  return new Set(
    value.split(",").map((candidate) => {
      const origin = candidate.trim();
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throw invalidOriginsError();
      }

      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.origin !== origin
      ) {
        throw invalidOriginsError();
      }

      return origin;
    }),
  );
}

function invalidOriginsError(): Error {
  return new Error(
    "ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins.",
  );
}
