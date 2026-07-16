import { describe, expect, it } from "vitest";

import {
  createJobCapabilityIssuer,
  decodeJobCapabilitySecret,
} from "./job-capability.js";

describe("hosted TAP job capabilities", () => {
  it("binds signed capabilities to the remote job and operation", async () => {
    const issuer = createJobCapabilityIssuer({
      secret: new Uint8Array(32).fill(7),
    });
    const capability = issuer.issue({
      jobUrl: "https://tap.example/async/1",
      operations: ["status"],
    });
    expect(capability).toEqual(expect.any(String));

    await expect(
      Promise.resolve(
        issuer.verify({
          capability,
          jobUrl: "https://tap.example/async/1",
          operation: "status",
        }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      Promise.resolve().then(() =>
        issuer.verify({
          capability,
          jobUrl: "https://tap.example/async/1",
          operation: "delete",
        }),
      ),
    ).rejects.toThrow("claims invalid");

    await expect(
      Promise.resolve().then(() =>
        issuer.verify({
          capability,
          jobUrl: "https://tap.example/async/1",
          operation: "status",
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it("requires a base64url secret containing at least 32 bytes", () => {
    expect(() => decodeJobCapabilitySecret("not+base64")).toThrow("base64url");
    expect(() => decodeJobCapabilitySecret("c2hvcnQ")).toThrow("32 bytes");
    expect(
      decodeJobCapabilitySecret(Buffer.alloc(32, 1).toString("base64url")),
    ).toHaveLength(32);
  });
});
