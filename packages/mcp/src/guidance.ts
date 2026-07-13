import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  readStarfetchSkillFile,
  type StarfetchSkillPath,
} from "@starfetch-js/skill";
import { z } from "zod/v4";

type GuidanceAsset = {
  description: string;
  path: StarfetchSkillPath;
  title: string;
  uri: `starfetch://${string}`;
};

const guidanceResources: GuidanceAsset[] = [
  {
    description: "Metadata-backed ADQL syntax and failure recovery guidance.",
    path: "references/adql.md",
    title: "Starfetch ADQL guide",
    uri: "starfetch://guides/adql",
  },
  {
    description:
      "Workflow for inspecting TAP availability, capabilities, tables, and columns.",
    path: "references/tap-metadata.md",
    title: "Starfetch TAP metadata guide",
    uri: "starfetch://guides/tap-metadata",
  },
  {
    description: "Gaia-specific query guidance and interpretation limits.",
    path: "references/services/gaia.md",
    title: "Starfetch Gaia service guide",
    uri: "starfetch://services/gaia",
  },
  {
    description: "SIMBAD-specific query guidance and interpretation limits.",
    path: "references/services/simbad.md",
    title: "Starfetch SIMBAD service guide",
    uri: "starfetch://services/simbad",
  },
  {
    description: "Complete metadata-first Gaia proper-motion workflow.",
    path: "examples/proper-motion.md",
    title: "Starfetch proper-motion example",
    uri: "starfetch://examples/proper-motion",
  },
];

export function registerStarfetchGuidance(server: McpServer): void {
  registerResources(server);
  registerPrompts(server);
}

function registerResources(server: McpServer): void {
  for (const resource of guidanceResources) {
    server.registerResource(
      resource.title,
      resource.uri,
      {
        description: resource.description,
        mimeType: "text/markdown",
        title: resource.title,
      },
      async () => ({
        contents: [
          {
            mimeType: "text/markdown",
            text: await readStarfetchSkillFile(resource.path),
            uri: resource.uri,
          },
        ],
      }),
    );
  }
}

function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "query_astronomy_catalog",
    {
      argsSchema: {
        question: z
          .string()
          .trim()
          .min(1)
          .describe("Astronomy catalog question to answer."),
        service: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Preferred Starfetch preset or TAP URL, when known."),
      },
      description:
        "Plan and execute a bounded metadata-first astronomy catalog query.",
      title: "Query an astronomy catalog",
    },
    async ({ question, service }) => ({
      description: "Metadata-first Starfetch catalog-query workflow.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: await promptText(
              `Answer this catalog question: ${question}\nPreferred service: ${service ?? "not specified; select or discover one"}`,
              [
                "references/tap-metadata.md",
                "references/adql.md",
                "references/query-safety.md",
              ],
            ),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "explore_service",
    {
      argsSchema: {
        service: z
          .string()
          .trim()
          .min(1)
          .describe("Starfetch preset or TAP base URL to inspect."),
        topic: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "Optional scientific topic used to narrow table discovery.",
          ),
      },
      description:
        "Inspect a TAP service before constructing service-specific ADQL.",
      title: "Explore a TAP service",
    },
    async ({ service, topic }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: await promptText(
              `Explore TAP service ${service}. Topic: ${topic ?? "general discovery"}. Do not run a data query until the relevant table and columns have been inspected.`,
              ["references/tap-metadata.md", "references/query-safety.md"],
            ),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "run_cone_search",
    {
      argsSchema: {
        dec: z.string().trim().min(1).describe("ICRS declination in degrees."),
        radius: z.string().trim().min(1).describe("Cone radius in degrees."),
        ra: z
          .string()
          .trim()
          .min(1)
          .describe("ICRS right ascension in degrees."),
        service: z
          .string()
          .trim()
          .min(1)
          .describe("Starfetch preset or TAP base URL."),
      },
      description: "Build and run a bounded metadata-backed ADQL cone search.",
      title: "Run a cone search",
    },
    async ({ dec, radius, ra, service }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: await promptText(
              `Run a bounded cone search on ${service} centered at ICRS RA ${ra} degrees, Dec ${dec} degrees, radius ${radius} degrees. Inspect the exact table, coordinate columns, units, and spatial-function support first.`,
              [
                "references/tap-metadata.md",
                "references/adql.md",
                "examples/cone-search.md",
              ],
            ),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "troubleshoot_adql",
    {
      argsSchema: {
        error: z
          .string()
          .trim()
          .min(1)
          .describe("Observed service or ADQL error."),
        query: z.string().trim().min(1).describe("Exact ADQL that failed."),
        service: z
          .string()
          .trim()
          .min(1)
          .describe("Starfetch preset or TAP base URL."),
      },
      description:
        "Diagnose a failed ADQL query by returning to service metadata.",
      title: "Troubleshoot ADQL",
    },
    async ({ error, query, service }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: await promptText(
              `Diagnose this failed query on ${service}.\nExact ADQL:\n${query}\nObserved error:\n${error}\nRe-inspect tables, columns, and capabilities before proposing one bounded retry. Do not report the failure as an empty result.`,
              [
                "references/tap-metadata.md",
                "references/adql.md",
                "references/query-safety.md",
              ],
            ),
          },
        },
      ],
    }),
  );
}

async function promptText(
  instruction: string,
  paths: StarfetchSkillPath[],
): Promise<string> {
  const references = await Promise.all(
    paths.map((path) => readStarfetchSkillFile(path)),
  );
  return [
    instruction,
    "Follow this canonical Starfetch guidance:",
    ...references,
  ].join("\n\n");
}
