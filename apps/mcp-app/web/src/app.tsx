import type { App } from "@modelcontextprotocol/ext-apps";
import {
  useApp,
  useHostStyleVariables,
} from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useMemo, useState } from "react";

import {
  StarfetchHostSession,
  type HostContextListener,
  type StarfetchDisplayMode,
  type StarfetchHostBridge,
} from "./host-ui.js";
import { ResultsTable } from "./results-table.js";
import { decodeTableView, type DecodedTableView } from "./widget-state.js";

export function StarfetchApp() {
  const [decoded, setDecoded] = useState<DecodedTableView>();
  const { app, error, isConnected } = useApp({
    appInfo: { name: "Starfetch results", version: "1.0.0" },
    capabilities: {
      availableDisplayModes: ["inline", "fullscreen"],
    },
    onAppCreated(createdApp) {
      createdApp.ontoolresult = (result) => {
        setDecoded(
          result.isError
            ? { ok: false, message: "Starfetch could not render this result." }
            : decodeTableView(result.structuredContent),
        );
      };
      createdApp.ontoolcancelled = () => {
        setDecoded({
          ok: false,
          message: "The Starfetch result was cancelled before it could render.",
        });
      };
    },
    strict: true,
  });
  useHostStyleVariables(app, app?.getHostContext());

  const host = useMemo(
    () =>
      app
        ? new StarfetchHostSession(createAppBridge(app), writeClipboard)
        : null,
    [app],
  );
  useEffect(
    () => () => {
      host?.dispose();
    },
    [host],
  );

  if (error) {
    return <ErrorState message="The widget could not connect to its host." />;
  }
  if (!isConnected || host === null) {
    return <LoadingState message="Connecting to the host…" />;
  }
  if (decoded === undefined) {
    return <LoadingState message="Waiting for Starfetch results…" />;
  }
  if (!decoded.ok) {
    return <ErrorState message={decoded.message} />;
  }
  return <ResultsTable host={host} view={decoded.view} />;
}

function createAppBridge(app: App): StarfetchHostBridge {
  return {
    addHostContextListener(listener: HostContextListener) {
      app.addEventListener("hostcontextchanged", listener);
    },
    downloadFile: (params) => app.downloadFile(params),
    getHostCapabilities: () => app.getHostCapabilities(),
    getHostContext: () => app.getHostContext(),
    removeHostContextListener(listener: HostContextListener) {
      app.removeEventListener("hostcontextchanged", listener);
    },
    async requestDisplayMode(mode: StarfetchDisplayMode) {
      return (await app.requestDisplayMode({ mode })).mode;
    },
  };
}

function writeClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText === undefined) {
    return Promise.reject(new Error("Clipboard unavailable"));
  }
  return navigator.clipboard.writeText(value);
}

function LoadingState({ message }: { message: string }) {
  return (
    <main className="message-state" aria-live="polite">
      <p>{message}</p>
    </main>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="message-state error-state" role="alert">
      <h1>Unable to show Starfetch results</h1>
      <p>{message}</p>
    </main>
  );
}
