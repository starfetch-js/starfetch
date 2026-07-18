import type { LookupFunction } from "node:net";

import { describe, expect, it } from "vitest";

import { createPinnedLookup } from "./pinned-http-transport.js";

describe("Undici pinned address lookup", () => {
  it("returns only addresses matching the requested family", async () => {
    const lookup = createPinnedLookup([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);

    await expect(lookupAddress(lookup, 4)).resolves.toEqual({
      address: "93.184.216.34",
      family: 4,
    });
    await expect(lookupAddress(lookup, 6)).resolves.toEqual({
      address: "2606:2800:220:1:248:1893:25c8:1946",
      family: 6,
    });
  });
});

function lookupAddress(
  lookup: LookupFunction,
  family: 4 | 6,
): Promise<{ address: string; family: number }> {
  return new Promise((resolve, reject) => {
    lookup(
      "example.test",
      { all: false, family },
      (error, address, resultFamily) => {
        if (error !== null) {
          reject(error);
          return;
        }
        if (typeof address !== "string" || resultFamily === undefined) {
          reject(new Error("Expected one pinned lookup address."));
          return;
        }
        resolve({ address, family: resultFamily });
      },
    );
  });
}
