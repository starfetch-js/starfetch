import { describe, expect, it } from "vitest";

import { createFixedWindowRateLimiter } from "./rate-limiter.js";

describe("fixed-window hosted rate limiter", () => {
  it("enforces one global limit and resets the window", () => {
    let now = 0;
    const limiter = createFixedWindowRateLimiter({
      limit: 2,
      now: () => now,
      windowMs: 100,
    });
    expect(limiter.consume().allowed).toBe(true);
    expect(limiter.consume().allowed).toBe(true);
    expect(limiter.consume().allowed).toBe(false);
    now = 100;
    expect(limiter.consume().allowed).toBe(true);
  });
});
