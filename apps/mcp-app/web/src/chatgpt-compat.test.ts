import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeChatGptToolMetadata,
  subscribeToChatGptToolResults,
} from "./chatgpt-compat.js";

afterEach(() => {
  delete window.openai;
});

describe("ChatGPT compatibility adapter", () => {
  it("normalizes only the supported metadata envelopes", () => {
    const metadata = { starfetchTableDataset: { datasetVersion: 1 } };

    expect(normalizeChatGptToolMetadata(metadata)).toBe(metadata);
    expect(
      normalizeChatGptToolMetadata({
        mcp_tool_result: { _meta: metadata },
      }),
    ).toBe(metadata);
    expect(
      normalizeChatGptToolMetadata({
        call_tool_result: { _meta: metadata },
      }),
    ).toBeUndefined();
  });

  it("publishes the initial and every subsequent ChatGPT tool snapshot", () => {
    const listener = vi.fn();
    window.openai = { toolOutput: { page: 1 } };
    const unsubscribe = subscribeToChatGptToolResults(listener);

    window.openai = { toolOutput: { page: 2 } };
    window.dispatchEvent(new Event("openai:set_globals"));

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, {
      structuredContent: { page: 1 },
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      structuredContent: { page: 2 },
    });
    unsubscribe();
  });
});
