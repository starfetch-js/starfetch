import { describe, expect, it, vi } from "vitest";

import {
  StarfetchHostSession,
  type HostContextListener,
  type StarfetchDisplayMode,
  type StarfetchHostBridge,
  type StarfetchHostCapabilities,
  type StarfetchHostContext,
} from "./host-ui.js";

describe("StarfetchHostSession", () => {
  it("expands and collapses through host-supported display modes", async () => {
    const requestDisplayMode = vi
      .fn<(mode: StarfetchDisplayMode) => Promise<StarfetchDisplayMode>>()
      .mockImplementation(async (mode) => mode);
    const bridge = createBridge({
      context: {
        availableDisplayModes: ["inline", "fullscreen"],
        displayMode: "inline",
      },
      requestDisplayMode,
    });
    const session = new StarfetchHostSession(bridge, vi.fn());

    expect(session.getSnapshot()).toMatchObject({
      canExpand: true,
      mode: "inline",
    });
    await expect(session.setExpanded(true)).resolves.toBe(true);
    expect(requestDisplayMode).toHaveBeenCalledWith("fullscreen");
    expect(session.getSnapshot().mode).toBe("fullscreen");

    await expect(session.setExpanded(false)).resolves.toBe(true);
    expect(requestDisplayMode).toHaveBeenCalledWith("inline");
    expect(session.getSnapshot().mode).toBe("inline");
  });

  it("publishes host context changes through one normalized snapshot", () => {
    let hostContextListener: HostContextListener | undefined;
    const bridge = createBridge({
      captureHostContextListener: (listener) => {
        hostContextListener = listener;
      },
      context: {
        availableDisplayModes: ["inline", "fullscreen"],
        displayMode: "inline",
      },
      requestDisplayMode: vi.fn(),
    });
    const session = new StarfetchHostSession(bridge, vi.fn());
    const onChange = vi.fn();
    const unsubscribe = session.subscribe(onChange);

    hostContextListener?.({ displayMode: "fullscreen", theme: "dark" });

    expect(onChange).toHaveBeenCalledOnce();
    expect(session.getSnapshot()).toMatchObject({
      canExpand: true,
      mode: "fullscreen",
    });

    unsubscribe();
    session.dispose();
    expect(bridge.removeHostContextListener).toHaveBeenCalledOnce();
  });

  it("downloads an explicitly formatted file through the host", async () => {
    const downloadFile = vi
      .fn<StarfetchHostBridge["downloadFile"]>()
      .mockResolvedValue({});
    const writeClipboard = vi.fn<(value: string) => Promise<void>>();
    const bridge = createBridge({
      capabilities: { downloadFile: {} },
      context: { displayMode: "inline" },
      downloadFile,
      requestDisplayMode: vi.fn(),
    });
    const session = new StarfetchHostSession(bridge, writeClipboard);

    await expect(
      session.saveFile("starfetch-results.csv", "text/csv", "id\n42"),
    ).resolves.toBe(true);
    expect(downloadFile).toHaveBeenCalledWith({
      contents: [
        {
          type: "resource",
          resource: {
            mimeType: "text/csv",
            text: "id\n42",
            uri: "file:///starfetch-results.csv",
          },
        },
      ],
    });
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it("falls back to the ChatGPT file flow when standard download is unavailable", async () => {
    const saveFileFallback = vi.fn().mockResolvedValue(true);
    const session = new StarfetchHostSession(
      createBridge({
        context: { displayMode: "inline" },
        requestDisplayMode: vi.fn(),
      }),
      vi.fn(),
      saveFileFallback,
    );

    await expect(
      session.saveFile("starfetch-results.csv", "text/csv", "id\n42"),
    ).resolves.toBe(true);
    expect(saveFileFallback).toHaveBeenCalledWith(
      "starfetch-results.csv",
      "text/csv",
      "id\n42",
    );
  });

  it("replaces model context with text rows when modalities are unspecified", async () => {
    const updateModelContext = vi.fn().mockResolvedValue({});
    const session = new StarfetchHostSession(
      createBridge({
        capabilities: { updateModelContext: {} },
        context: { displayMode: "inline" },
        requestDisplayMode: vi.fn(),
        updateModelContext,
      }),
      vi.fn(),
    );

    await expect(
      session.analyzeRows("Gaia results", 2, 4, "selection", [
        { source_id: "42" },
      ]),
    ).resolves.toBe(true);
    await expect(
      session.analyzeRows("Gaia results", 3, 4, "page", [{ source_id: "84" }]),
    ).resolves.toBe(true);
    expect(updateModelContext).toHaveBeenCalledTimes(2);
    expect(updateModelContext).toHaveBeenNthCalledWith(1, {
      content: [
        expect.objectContaining({
          text: expect.stringContaining('"source_id": "42"'),
        }),
      ],
    });
    expect(updateModelContext).toHaveBeenNthCalledWith(2, {
      content: [
        expect.objectContaining({
          text: expect.stringContaining('"source_id": "84"'),
        }),
      ],
    });
  });

  it("uses structured rows when the host advertises structured context", async () => {
    const updateModelContext = vi.fn().mockResolvedValue({});
    const session = new StarfetchHostSession(
      createBridge({
        capabilities: { updateModelContext: { structuredContent: {} } },
        context: { displayMode: "inline" },
        requestDisplayMode: vi.fn(),
        updateModelContext,
      }),
      vi.fn(),
    );

    await expect(
      session.analyzeRows("Gaia results", 2, 4, "selection", [
        { source_id: "42" },
      ]),
    ).resolves.toBe(true);
    expect(updateModelContext).toHaveBeenCalledWith({
      structuredContent: {
        page: 2,
        pageCount: 4,
        rowCount: 1,
        rows: [{ source_id: "42" }],
        scope: "selection",
        title: "Gaia results",
      },
    });
  });
});

function createBridge({
  capabilities = {},
  captureHostContextListener,
  context,
  downloadFile = vi.fn(),
  requestDisplayMode,
  updateModelContext = vi.fn(),
}: {
  capabilities?: StarfetchHostCapabilities;
  captureHostContextListener?: (listener: HostContextListener) => void;
  context: StarfetchHostContext;
  downloadFile?: StarfetchHostBridge["downloadFile"];
  requestDisplayMode: (
    mode: StarfetchDisplayMode,
  ) => Promise<StarfetchDisplayMode>;
  updateModelContext?: StarfetchHostBridge["updateModelContext"];
}): StarfetchHostBridge {
  return {
    addHostContextListener: (listener) =>
      captureHostContextListener?.(listener),
    downloadFile,
    getHostCapabilities: () => capabilities,
    getHostContext: () => context,
    removeHostContextListener: vi.fn(),
    requestDisplayMode,
    updateModelContext,
  };
}
