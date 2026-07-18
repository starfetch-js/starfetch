import { Hono } from "hono";
import { describe, expect, it } from "vitest";

import { closeHttpListener, listen } from "./listener.js";

describe("HTTP listener", () => {
  it("does not retain its startup error handler after binding", async () => {
    const listener = await listen(new Hono(), "127.0.0.1", 0);

    try {
      expect(() =>
        listener.emit("error", new Error("runtime failure")),
      ).toThrow("runtime failure");
    } finally {
      await closeHttpListener(listener);
    }
  });
});
