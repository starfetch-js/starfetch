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
  updateModelContext(
    params: Parameters<App["updateModelContext"]>[0],
  ): ReturnType<App["updateModelContext"]>;
}>;

export type StarfetchHostSnapshot = Readonly<{
  canAnalyze: boolean;
  canExpand: boolean;
  mode: StarfetchDisplayMode;
}>;

export type AnalysisScope = "page" | "selection";

export class StarfetchHostSession {
  readonly #bridge: StarfetchHostBridge;
  #context: StarfetchHostContext;
  readonly #listeners = new Set<() => void>();
  #snapshot: StarfetchHostSnapshot;
  readonly #writeClipboard: (value: string) => Promise<void>;
  readonly #saveFileFallback: (
    filename: string,
    mimeType: string,
    text: string,
  ) => Promise<boolean>;
  readonly #updateContext = (context: StarfetchHostContext) => {
    this.#context = { ...this.#context, ...context };
    this.#publish();
  };

  constructor(
    bridge: StarfetchHostBridge,
    writeClipboard: (value: string) => Promise<void>,
    saveFileFallback: (
      filename: string,
      mimeType: string,
      text: string,
    ) => Promise<boolean> = async () => false,
  ) {
    this.#bridge = bridge;
    this.#writeClipboard = writeClipboard;
    this.#saveFileFallback = saveFileFallback;
    this.#context = bridge.getHostContext() ?? {};
    this.#snapshot = createSnapshot(
      this.#context,
      bridge.getHostCapabilities(),
    );
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
      return this.#saveFileFallback(filename, mimeType, text);
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

  async analyzeRows(
    title: string,
    page: number,
    pageCount: number,
    scope: AnalysisScope,
    rows: ReadonlyArray<Record<string, unknown>>,
  ): Promise<boolean> {
    const modalities = this.#bridge.getHostCapabilities()?.updateModelContext;
    const supportsText =
      modalities !== undefined &&
      (modalities.text !== undefined || Object.keys(modalities).length === 0);
    const supportsStructured = modalities?.structuredContent !== undefined;
    if (
      modalities === undefined ||
      (!supportsText && !supportsStructured) ||
      rows.length === 0 ||
      rows.length > 100
    ) {
      return false;
    }

    try {
      const snapshot = {
        page,
        pageCount,
        rowCount: rows.length,
        rows,
        scope,
        title,
      };
      const subject =
        scope === "selection"
          ? `${rows.length} selected rows from`
          : "the visible rows on";
      const rowMeaning =
        scope === "selection"
          ? "the user's current selection"
          : "the current page";
      const description = `The user chose to analyze ${subject} page ${page} of ${pageCount} in ${title}. Treat these rows as ${rowMeaning}, not the complete query result.`;
      await this.#bridge.updateModelContext({
        ...(!supportsText
          ? {}
          : {
              content: [
                {
                  type: "text" as const,
                  text: !supportsStructured
                    ? `${description}\n\nStarfetch table snapshot:\n${JSON.stringify(snapshot, null, 2)}`
                    : description,
                },
              ],
            }),
        ...(!supportsStructured ? {} : { structuredContent: snapshot }),
      });
      return true;
    } catch {
      return false;
    }
  }

  #publish(): void {
    this.#snapshot = createSnapshot(
      this.#context,
      this.#bridge.getHostCapabilities(),
    );
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

function createSnapshot(
  context: StarfetchHostContext,
  capabilities?: StarfetchHostCapabilities,
): StarfetchHostSnapshot {
  return {
    canAnalyze: supportsTableContext(capabilities?.updateModelContext),
    canExpand:
      context.platform !== "mobile" &&
      (context.availableDisplayModes?.includes("fullscreen") ?? false),
    mode: context.displayMode ?? "inline",
  };
}

function supportsTableContext(
  modalities: StarfetchHostCapabilities["updateModelContext"],
): boolean {
  return (
    modalities !== undefined &&
    (Object.keys(modalities).length === 0 ||
      modalities.text !== undefined ||
      modalities.structuredContent !== undefined)
  );
}
