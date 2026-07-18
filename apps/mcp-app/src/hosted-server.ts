import { readFile } from "node:fs/promises";

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import {
  createStarfetchMcpServer,
  type StarfetchMcpServerOptions,
} from "@starfetch-js/mcp";

import {
  starfetchTableViewV1Schema,
  type StarfetchTableViewV1,
} from "./presentation.js";

export const STARFETCH_TABLE_RESOURCE_URI = "ui://starfetch/table/v1";

export type HostedStarfetchMcpServerOptions = Readonly<{
  loadWidgetHtml?: () => Promise<string>;
  mcp?: StarfetchMcpServerOptions;
  publicOrigin?: string;
}>;

export function createHostedStarfetchMcpServer(
  options: HostedStarfetchMcpServerOptions = {},
): ReturnType<typeof createStarfetchMcpServer> {
  const server = createStarfetchMcpServer(options.mcp);
  const loadWidgetHtml = options.loadWidgetHtml ?? loadBuiltWidgetHtml;
  const resourceMeta = {
    csp: {
      connectDomains: [],
      resourceDomains: [],
    },
    ...(options.publicOrigin === undefined
      ? {}
      : { domain: options.publicOrigin }),
    permissions: { clipboardWrite: {} },
    prefersBorder: false,
  } as const;

  registerAppTool(
    server,
    "starfetch_render_table",
    {
      title: "Render Starfetch results table",
      description:
        "Render an existing bounded StarfetchTableViewV1 as an interactive table. This tool does not query a TAP service.",
      inputSchema: starfetchTableViewV1Schema,
      outputSchema: starfetchTableViewV1Schema,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      _meta: {
        ui: {
          resourceUri: STARFETCH_TABLE_RESOURCE_URI,
          visibility: ["model"],
        },
      },
    },
    async (view) => ({
      content: [
        {
          type: "text",
          text: renderNarration(view),
        },
      ],
      structuredContent: view,
    }),
  );

  registerAppResource(
    server,
    "Starfetch results table",
    STARFETCH_TABLE_RESOURCE_URI,
    {
      description: "Interactive table for bounded Starfetch results.",
      _meta: { ui: resourceMeta },
    },
    async () => ({
      contents: [
        {
          uri: STARFETCH_TABLE_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: await loadWidgetHtml(),
          _meta: { ui: resourceMeta },
        },
      ],
    }),
  );

  return server;
}

function renderNarration(view: StarfetchTableViewV1): string {
  const count = view.rows.length;
  return `Rendered ${count} ${count === 1 ? "row" : "rows"} in the Starfetch results table.`;
}

let widgetHtmlPromise: Promise<string> | undefined;

function loadBuiltWidgetHtml(): Promise<string> {
  widgetHtmlPromise ??= readFile(
    new URL("../web/dist/index.html", import.meta.url),
    "utf8",
  );
  return widgetHtmlPromise;
}
