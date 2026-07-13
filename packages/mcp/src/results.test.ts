import { TapHttpError } from "@starfetch-js/core";
import { describe, expect, it } from "vitest";

import { runTool, success, targetDiagnostics } from "./results.js";

describe("MCP tool results", () => {
  it("serializes successful data and diagnostics consistently", () => {
    const result = success({ available: true }, { source: "vosi" });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            data: { available: true },
            diagnostics: { source: "vosi" },
          }),
        },
      ],
      structuredContent: {
        data: { available: true },
        diagnostics: { source: "vosi" },
      },
    });
  });

  it("includes only available target diagnostics", () => {
    expect(targetDiagnostics({ baseUrl: "https://example.test/tap" })).toEqual({
      baseUrl: "https://example.test/tap",
    });
    expect(
      targetDiagnostics({
        baseUrl: "https://example.test/tap",
        label: "Example TAP",
        service: "example",
      }),
    ).toEqual({
      baseUrl: "https://example.test/tap",
      label: "Example TAP",
      service: "example",
    });
  });

  it.each([
    [new TapHttpError("request failed"), "TapHttpError: request failed"],
    [new Error("unexpected failure"), "unexpected failure"],
    ["non-error rejection", "non-error rejection"],
  ])(
    "converts rejected tool callbacks into MCP errors",
    async (error, text) => {
      const result = await runTool(() => Promise.reject(error));

      expect(result).toEqual({
        content: [{ type: "text", text }],
        isError: true,
      });
    },
  );

  it("returns successful tool callbacks unchanged", async () => {
    const expected = success({ count: 1 }, { cached: false });

    await expect(runTool(() => Promise.resolve(expected))).resolves.toBe(
      expected,
    );
  });
});
