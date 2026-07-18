import { createHmac, timingSafeEqual } from "node:crypto";

import type { JobCapabilityOperation } from "@starfetch-js/mcp";

export type JobCapabilityCodec = Readonly<{
  issue(input: {
    jobUrl: string;
    operations: readonly JobCapabilityOperation[];
  }): string;
  verify(input: {
    capability: string | undefined;
    jobUrl: string;
    operation: JobCapabilityOperation;
  }): void;
}>;

type Claims = Readonly<{
  jobUrl: string;
  operations: readonly JobCapabilityOperation[];
  policy: "hosted-v1";
  version: 1;
}>;

export function createJobCapabilityIssuer(options: {
  secret: Uint8Array;
}): JobCapabilityCodec {
  if (options.secret.byteLength < 32) {
    throw new Error("Job capability secret must contain at least 32 bytes.");
  }
  return {
    issue(input) {
      const claims: Claims = {
        jobUrl: input.jobUrl,
        operations: input.operations,
        policy: "hosted-v1",
        version: 1,
      };
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
      return `${payload}.${sign(payload, options.secret)}`;
    },
    verify(input) {
      if (input.capability === undefined)
        throw new Error("Capability missing.");
      const [payload, providedSignature, extra] = input.capability.split(".");
      if (
        payload === undefined ||
        providedSignature === undefined ||
        extra !== undefined
      ) {
        throw new Error("Capability malformed.");
      }
      const expectedSignature = sign(payload, options.secret);
      const provided = Buffer.from(providedSignature, "base64url");
      const expected = Buffer.from(expectedSignature, "base64url");
      if (
        provided.byteLength !== expected.byteLength ||
        !timingSafeEqual(provided, expected)
      ) {
        throw new Error("Capability signature invalid.");
      }

      const claims = parseClaims(payload);
      if (
        claims.jobUrl !== input.jobUrl ||
        !claims.operations.includes(input.operation)
      ) {
        throw new Error("Capability claims invalid or expired.");
      }
    },
  };
}

export function decodeJobCapabilitySecret(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("STARFETCH_JOB_CAPABILITY_SECRET must be base64url.");
  }
  const secret = Buffer.from(value, "base64url");
  if (secret.byteLength < 32) {
    throw new Error(
      "STARFETCH_JOB_CAPABILITY_SECRET must decode to at least 32 bytes.",
    );
  }
  return secret;
}

function sign(payload: string, secret: Uint8Array): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function parseClaims(payload: string): Claims {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Capability payload invalid.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("version" in value) ||
    value.version !== 1 ||
    !("policy" in value) ||
    value.policy !== "hosted-v1" ||
    !("jobUrl" in value) ||
    typeof value.jobUrl !== "string" ||
    !("operations" in value) ||
    !Array.isArray(value.operations) ||
    !value.operations.every((operation) => typeof operation === "string")
  ) {
    throw new Error("Capability payload invalid.");
  }
  return value as Claims;
}
