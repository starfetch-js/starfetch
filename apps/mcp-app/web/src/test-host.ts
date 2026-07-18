import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import { PostMessageTransport } from "@modelcontextprotocol/ext-apps";

import { browserTestView } from "./test-fixture.js";

declare global {
  interface Window {
    setTestTheme(theme: "light" | "dark"): void;
    testDownload?: unknown;
  }
}

const iframe = document.querySelector("iframe");
if (!(iframe instanceof HTMLIFrameElement) || iframe.contentWindow === null) {
  throw new Error("Expected the browser-test widget iframe.");
}

type HostContext = NonNullable<
  NonNullable<ConstructorParameters<typeof AppBridge>[3]>["hostContext"]
>;

let hostContext: HostContext = {
  availableDisplayModes: ["inline", "fullscreen"],
  displayMode: "inline",
  theme: "light",
};
const bridge = new AppBridge(
  null,
  { name: "Starfetch browser test host", version: "1.0.0" },
  { downloadFile: {} },
  { hostContext },
);

bridge.ondownloadfile = async (params) => {
  window.testDownload = params;
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
  void bridge.sendToolResult({
    content: [],
    structuredContent: browserTestView,
  });
};

window.setTestTheme = (theme) => {
  hostContext = { ...hostContext, theme };
  bridge.setHostContext(hostContext);
};

await bridge.connect(
  new PostMessageTransport(iframe.contentWindow, iframe.contentWindow),
);
iframe.src = "/dist/index.html";
