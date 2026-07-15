import { z } from "zod/v4";

import {
  columnsOutputSchema,
  presetListOutputSchema,
  registrySearchOutputSchema,
  tablesOutputSchema,
  tapJobFetchOutputSchema,
  tapQueryOutputSchema,
} from "./schemas.js";

const starfetchTablePresentationSourceSchema = z.discriminatedUnion(
  "sourceTool",
  [
    z.object({
      sourceTool: z.literal("starfetch_list_presets"),
      structuredContent: presetListOutputSchema,
    }),
    z.object({
      sourceTool: z.literal("starfetch_registry_search"),
      structuredContent: registrySearchOutputSchema,
    }),
    z.object({
      sourceTool: z.literal("starfetch_tap_tables"),
      structuredContent: tablesOutputSchema,
    }),
    z.object({
      sourceTool: z.literal("starfetch_tap_columns"),
      structuredContent: columnsOutputSchema,
    }),
    z.object({
      sourceTool: z.literal("starfetch_tap_query"),
      structuredContent: tapQueryOutputSchema,
    }),
    z.object({
      sourceTool: z.literal("starfetch_tap_job_fetch"),
      structuredContent: tapJobFetchOutputSchema,
    }),
  ],
);

/** Successful canonical MCP outputs supported by the hosted table presenter. */
export type StarfetchTablePresentationSource = z.infer<
  typeof starfetchTablePresentationSourceSchema
>;

/** Validate a supported canonical MCP output before table presentation. */
export function parseStarfetchTablePresentationSource(
  input: unknown,
): StarfetchTablePresentationSource {
  return starfetchTablePresentationSourceSchema.parse(input);
}
