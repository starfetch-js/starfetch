import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { PostMessageTransport } from "@modelcontextprotocol/ext-apps";

import { browserTestView } from "./test-fixture.js";

declare global {
  interface Window {
    setTestTheme(theme: "light" | "dark"): void;
    testDownload?: unknown;
    testModelContext?: unknown;
    testModelContextUpdates?: number;
  }
}

const iframe = document.querySelector("iframe");
if (!(iframe instanceof HTMLIFrameElement) || iframe.contentWindow === null) {
  throw new Error("Expected the browser-test widget iframe.");
}
const searchParams = new URLSearchParams(window.location.search);
const delayedGlobals = searchParams.has("delayed-globals");
const globalsOnly = searchParams.has("globals") || delayedGlobals;
const mobileHost = searchParams.has("mobile");

type HostContext = NonNullable<
  NonNullable<ConstructorParameters<typeof AppBridge>[3]>["hostContext"]
>;

let hostContext: HostContext = {
  availableDisplayModes: ["inline", "fullscreen"],
  displayMode: "inline",
  platform: mobileHost ? "mobile" : "web",
  theme: "light",
};
const bridge = new AppBridge(
  null,
  { name: "Starfetch browser test host", version: "1.0.0" },
  { downloadFile: {}, updateModelContext: {} },
  { hostContext },
);

bridge.ondownloadfile = async (params) => {
  window.testDownload = params;
  return {};
};
bridge.onupdatemodelcontext = async (params) => {
  window.testModelContext = params;
  window.testModelContextUpdates = (window.testModelContextUpdates ?? 0) + 1;
  return {};
};
bridge.onrequestdisplaymode = async ({ mode }) => {
  const actualMode = mode === "fullscreen" ? "fullscreen" : "inline";
  hostContext = {
    ...hostContext,
    displayMode: actualMode,
  };
  bridge.setHostContext(hostContext);
  return { mode: actualMode };
};
bridge.oninitialized = () => {
  void bridge.sendToolInput({ arguments: browserTestView });
  if (!globalsOnly) {
    void bridge.sendToolResult({
      content: [],
      structuredContent: browserTestView,
    });
  }
};

window.setTestTheme = (theme) => {
  hostContext = { ...hostContext, theme };
  bridge.setHostContext(hostContext);
};

await bridge.connect(
  new PostMessageTransport(iframe.contentWindow, iframe.contentWindow),
);
if (globalsOnly) {
  iframe.addEventListener("load", () => {
    if (iframe.contentWindow === null) return;
    const publishCompleteGlobals = () => {
      if (iframe.contentWindow === null) return;
      iframe.contentWindow.openai = {
        toolOutput: { contractVersion: 2 },
        toolResponseMetadata: {
          mcp_tool_result: {
            _meta: {
              starfetchTableDataset: {
                datasetVersion: 1,
                view: browserTestView,
              },
            },
          },
        },
      };
      iframe.contentWindow.dispatchEvent(new Event("openai:set_globals"));
    };
    if (!delayedGlobals) {
      publishCompleteGlobals();
      return;
    }
    iframe.contentWindow.openai = {
      toolOutput: { contractVersion: 2 },
    };
    iframe.contentWindow.dispatchEvent(new Event("openai:set_globals"));
    window.setTimeout(publishCompleteGlobals, 2_500);
  });
}
iframe.src = "/dist/index.html";
