import type { App } from "@modelcontextprotocol/ext-apps";

export type StarfetchDisplayMode = "inline" | "fullscreen" | "pip";
export type StarfetchHostCapabilities = NonNullable<
  ReturnType<App["getHostCapabilities"]>
>;
export type StarfetchHostContext = NonNullable<
  ReturnType<App["getHostContext"]>
>;
export type HostContextListener = (context: StarfetchHostContext) => void;

export type StarfetchHostBridge = Readonly<{
  addHostContextListener(listener: HostContextListener): void;
  downloadFile(
    params: Parameters<App["downloadFile"]>[0],
  ): ReturnType<App["downloadFile"]>;
  getHostCapabilities(): StarfetchHostCapabilities | undefined;
  getHostContext(): StarfetchHostContext | undefined;
  removeHostContextListener(listener: HostContextListener): void;
  requestDisplayMode(mode: StarfetchDisplayMode): Promise<StarfetchDisplayMode>;
}>;

export type StarfetchHostSnapshot = Readonly<{
  canExpand: boolean;
  mode: StarfetchDisplayMode;
}>;

export class StarfetchHostSession {
  readonly #bridge: StarfetchHostBridge;
  #context: StarfetchHostContext;
  readonly #listeners = new Set<() => void>();
  #snapshot: StarfetchHostSnapshot;
  readonly #writeClipboard: (value: string) => Promise<void>;
  readonly #updateContext = (context: StarfetchHostContext) => {
    this.#context = { ...this.#context, ...context };
    this.#publish();
  };

  constructor(
    bridge: StarfetchHostBridge,
    writeClipboard: (value: string) => Promise<void>,
  ) {
    this.#bridge = bridge;
    this.#writeClipboard = writeClipboard;
    this.#context = bridge.getHostContext() ?? {};
    this.#snapshot = createSnapshot(this.#context);
    bridge.addHostContextListener(this.#updateContext);
  }

  getSnapshot(): StarfetchHostSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    this.#bridge.removeHostContextListener(this.#updateContext);
    this.#listeners.clear();
  }

  async setExpanded(expanded: boolean): Promise<boolean> {
    if (!this.#snapshot.canExpand) {
      return false;
    }

    const requestedMode = expanded ? "fullscreen" : "inline";
    const mode = await this.#bridge.requestDisplayMode(requestedMode);
    this.#context = { ...this.#context, displayMode: mode };
    this.#publish();
    return mode === requestedMode;
  }

  async copyText(value: string): Promise<boolean> {
    try {
      await this.#writeClipboard(value);
      return true;
    } catch {
      return false;
    }
  }

  async saveFile(
    filename: string,
    mimeType: string,
    text: string,
  ): Promise<boolean> {
    if (this.#bridge.getHostCapabilities()?.downloadFile === undefined) {
      return false;
    }

    try {
      const result = await this.#bridge.downloadFile({
        contents: [
          {
            type: "resource",
            resource: {
              uri: `file:///${filename}`,
              mimeType,
              text,
            },
          },
        ],
      });
      return !result.isError;
    } catch {
      return false;
    }
  }

  #publish(): void {
    this.#snapshot = createSnapshot(this.#context);
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

function createSnapshot(context: StarfetchHostContext): StarfetchHostSnapshot {
  return {
    canExpand: context.availableDisplayModes?.includes("fullscreen") ?? false,
    mode: context.displayMode ?? "inline",
  };
}
