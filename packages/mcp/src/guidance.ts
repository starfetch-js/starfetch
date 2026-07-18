import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  readStarfetchSkillFile,
  starfetchSkillPaths,
  type StarfetchSkillPath,
} from "@starfetch-js/skill";
import { z } from "zod/v4";

type GuidanceResourceMetadata = {
  description: string;
  title: string;
  uri: `starfetch://${string}`;
};

const guidanceResourceMetadata = {
  "SKILL.md": {
    description:
      "Complete metadata-first Starfetch workflow, fallback, safety, and reporting guidance.",
    title: "Starfetch workflow guide",
    uri: "starfetch://guides/workflow",
  },
  "references/adql.md": {
    description: "Metadata-backed ADQL syntax and failure recovery guidance.",
    title: "Starfetch ADQL guide",
    uri: "starfetch://guides/adql",
  },
  "references/tap-metadata.md": {
    description:
      "Workflow for inspecting TAP availability, capabilities, tables, and columns.",
    title: "Starfetch TAP metadata guide",
    uri: "starfetch://guides/tap-metadata",
  },
  "references/query-safety.md": {
    description:
      "Bounds, untrusted-content handling, and reproducible reporting for public TAP queries.",
    title: "Starfetch query safety guide",
    uri: "starfetch://guides/query-safety",
  },
  "references/services/gaia.md": {
    description: "Gaia-specific query guidance and interpretation limits.",
    title: "Starfetch Gaia service guide",
    uri: "starfetch://services/gaia",
  },
  "references/services/simbad.md": {
    description: "SIMBAD-specific query guidance and interpretation limits.",
    title: "Starfetch SIMBAD service guide",
    uri: "starfetch://services/simbad",
  },
  "references/services/vizier.md": {
    description:
      "VizieR catalog discovery, schema inspection, and bounded-query guidance.",
    title: "Starfetch VizieR service guide",
    uri: "starfetch://services/vizier",
  },
  "references/services/exoplanet-archive.md": {
    description:
      "NASA Exoplanet Archive table-selection and scientific-interpretation guidance.",
    title: "Starfetch NASA Exoplanet Archive service guide",
    uri: "starfetch://services/exoplanet-archive",
  },
  "references/services/irsa.md": {
    description:
      "IRSA catalog selection, metadata, and bounded-query guidance.",
    title: "Starfetch IRSA service guide",
    uri: "starfetch://services/irsa",
  },
  "examples/cone-search.md": {
    description:
      "Metadata-first bounded cone-search workflow using discovered coordinate columns.",
    title: "Starfetch cone-search example",
    uri: "starfetch://examples/cone-search",
  },
  "examples/proper-motion.md": {
    description: "Complete metadata-first Gaia proper-motion workflow.",
    title: "Starfetch proper-motion example",
    uri: "starfetch://examples/proper-motion",
  },
  "examples/exoplanets.md": {
    description: "Metadata-first short-period exoplanet query workflow.",
    title: "Starfetch exoplanet example",
    uri: "starfetch://examples/exoplanets",
  },
  "examples/object-types.md": {
    description: "Metadata-first SIMBAD regional object-type query workflow.",
    title: "Starfetch SIMBAD object-types example",
    uri: "starfetch://examples/object-types",
  },
} satisfies Record<StarfetchSkillPath, GuidanceResourceMetadata>;

export function registerStarfetchGuidance(server: McpServer): void {
  registerResources(server);
  registerPrompts(server);
}

function registerResources(server: McpServer): void {
  for (const path of starfetchSkillPaths) {
    const resource = guidanceResourceMetadata[path];
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
            text: await readStarfetchSkillFile(path),
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
