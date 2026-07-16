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
});

function createBridge({
  capabilities = {},
  captureHostContextListener,
  context,
  downloadFile = vi.fn(),
  requestDisplayMode,
}: {
  capabilities?: StarfetchHostCapabilities;
  captureHostContextListener?: (listener: HostContextListener) => void;
  context: StarfetchHostContext;
  downloadFile?: StarfetchHostBridge["downloadFile"];
  requestDisplayMode: (
    mode: StarfetchDisplayMode,
  ) => Promise<StarfetchDisplayMode>;
}): StarfetchHostBridge {
  return {
    addHostContextListener: (listener) =>
      captureHostContextListener?.(listener),
    downloadFile,
    getHostCapabilities: () => capabilities,
    getHostContext: () => context,
    removeHostContextListener: vi.fn(),
    requestDisplayMode,
  };
}
