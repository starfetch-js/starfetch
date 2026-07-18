import { readFile } from "node:fs/promises";

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import {
  createStarfetchMcpServer,
  executeStarfetchTapQuery,
  tapQueryInputShape,
  tapTargetInputShape,
  unrestrictedStarfetchMcpPolicy,
  type StarfetchMcpServerOptions,
} from "@starfetch-js/mcp";
import { z } from "zod/v4";

import {
  createStarfetchTableView,
  createStarfetchWidgetTableDataset,
  starfetchTableViewV1Schema,
  type StarfetchTableViewV1,
} from "./presentation.js";
import { hostedPolicyLimits } from "./hosted-policy.js";

export const STARFETCH_TABLE_RESOURCE_URI = "ui://starfetch/table/v1";
const hostedTableDefaultMaxrec = 1_000;
const modelPreviewRows = 20;

const hostedTableQueryInputSchema = z
  .object({
    ...tapTargetInputShape,
    query: tapQueryInputShape.query,
    runId: tapQueryInputShape.runId,
    format: z.literal("json").default("json"),
    maxrec: z
      .number()
      .int()
      .nonnegative()
      .max(hostedPolicyLimits.maxrec)
      .optional()
      .describe(
        `TAP MAXREC row limit for the interactive table. Defaults to ${hostedTableDefaultMaxrec.toLocaleString("en-US")} and cannot exceed ${hostedPolicyLimits.maxrec.toLocaleString("en-US")}.`,
      ),
  })
  .refine((input) => input.service !== undefined || input.url !== undefined, {
    message: "Specify service or url.",
    path: ["service"],
  });

export type HostedStarfetchMcpServerOptions = Readonly<{
  loadWidgetHtml?: () => Promise<string>;
  mcp?: StarfetchMcpServerOptions;
  publicOrigin?: string;
}>;

export function createHostedStarfetchMcpServer(
  options: HostedStarfetchMcpServerOptions = {},
): ReturnType<typeof createStarfetchMcpServer> {
  const server = createStarfetchMcpServer(options.mcp);
  const queryExecutionOptions = {
    ...options.mcp,
    policy: options.mcp?.policy ?? unrestrictedStarfetchMcpPolicy,
  };
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

  registerAppTool(
    server,
    "starfetch_query_table",
    {
      title: "Query an interactive Starfetch table",
      description:
        "Run a metadata-backed synchronous TAP ADQL query and show up to 10,000 rows in an interactive table. Prefer this over starfetch_tap_query followed by starfetch_render_table when the user wants to inspect scientific rows. The model receives a small preview; the widget privately receives the loaded table.",
      inputSchema: hostedTableQueryInputSchema,
      outputSchema: starfetchTableViewV1Schema,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
      _meta: {
        ui: {
          resourceUri: STARFETCH_TABLE_RESOURCE_URI,
          visibility: ["model"],
        },
      },
    },
    async (input, extra) => {
      const result = await executeStarfetchTapQuery(
        input,
        extra.signal,
        queryExecutionOptions,
        hostedTableDefaultMaxrec,
      );
      if (result.isError || result.structuredContent === undefined) {
        return result;
      }

      const presentationSource = {
        sourceTool: "starfetch_tap_query",
        structuredContent: result.structuredContent,
      } as const;
      const dataset = createStarfetchWidgetTableDataset(presentationSource);
      const preview = createModelPreview(
        createStarfetchTableView(presentationSource),
      );
      return {
        content: [
          {
            type: "text",
            text: renderQueryNarration(dataset.view, preview.rows.length),
          },
        ],
        structuredContent: preview,
        _meta: { starfetchTableDataset: dataset },
      };
    },
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

function createModelPreview(view: StarfetchTableViewV1): StarfetchTableViewV1 {
  if (view.rows.length <= modelPreviewRows) return view;

  return starfetchTableViewV1Schema.parse({
    ...view,
    rows: view.rows.slice(0, modelPreviewRows),
    clipping: {
      ...view.clipping,
      reasons: Array.from(new Set([...view.clipping.reasons, "rows"])),
    },
  });
}

function renderQueryNarration(
  view: StarfetchTableViewV1,
  previewRows: number,
): string {
  const loadedRows = view.rows.length;
  return `Loaded ${loadedRows} ${loadedRows === 1 ? "row" : "rows"} in the interactive Starfetch table. The model-visible preview contains ${previewRows} ${previewRows === 1 ? "row" : "rows"}.`;
}

let widgetHtmlPromise: Promise<string> | undefined;

function loadBuiltWidgetHtml(): Promise<string> {
  widgetHtmlPromise ??= readFile(
    new URL("../web/dist/index.html", import.meta.url),
    "utf8",
  );
  return widgetHtmlPromise;
}
