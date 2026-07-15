import {
  parseTapJobReference,
  tapOutputFormats,
  tapSyncFormats,
  type TapResultField,
} from "@starfetch-js/core";
import { z } from "zod/v4";

const textSchema = z.string().trim().min(1);
const optionalTextSchema = textSchema.optional();

const targetFields = {
  service: optionalTextSchema.describe(
    "Known Starfetch TAP service preset selected for this workflow; use this or url.",
  ),
  url: optionalTextSchema.describe(
    "Explicit TAP base URL selected for this workflow; use this or service.",
  ),
};

export const targetInputSchema = z.object(targetFields).refine(hasTapTarget, {
  message: "Specify service or url.",
  path: ["service"],
});
export type TargetInput = z.infer<typeof targetInputSchema>;

export const registrySearchInputSchema = z.object({
  query: optionalTextSchema.describe("Registry search text."),
  maxrec: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("TAP MAXREC row limit for registry results."),
  registryUrl: optionalTextSchema.describe("Explicit RegTAP service URL."),
});

export const columnsInputSchema = z
  .object({
    ...targetFields,
    table: textSchema.describe(
      "Exact TAP table name returned by prior metadata inspection.",
    ),
  })
  .refine(hasTapTarget, {
    message: "Specify service or url.",
    path: ["service"],
  });

const maxrecSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .describe("TAP MAXREC row limit. Defaults to 100 when omitted.");

const tapUploadUriSchema = z.object({
  tableName: textSchema.describe("Temporary TAP_UPLOAD table name."),
  uri: textSchema.describe("Remote VOTable URI for TAP upload."),
});

const tapUploadInlineSchema = z.object({
  filename: optionalTextSchema.describe("Optional inline VOTable filename."),
  tableName: textSchema.describe("Temporary TAP_UPLOAD table name."),
  votable: textSchema.describe("Inline VOTable XML content."),
});

const uploadsSchema = z
  .array(z.union([tapUploadUriSchema, tapUploadInlineSchema]))
  .optional()
  .describe(
    "TAP uploads forwarded to the service; local file paths are not supported.",
  );

const tapQueryFields = {
  format: z.enum(tapOutputFormats).describe("MCP result output format."),
  maxrec: maxrecSchema.optional(),
  query: textSchema.describe(
    "Exact metadata-backed ADQL query text. Use TOP for a query-level bound; do not use LIMIT.",
  ),
  runId: optionalTextSchema.describe("Optional TAP RUNID request value."),
  uploads: uploadsSchema,
};

export const tapQueryInputSchema = z
  .object({
    ...targetFields,
    ...tapQueryFields,
  })
  .refine(hasTapTarget, {
    message: "Specify service or url.",
    path: ["service"],
  });
export type TapQueryInput = z.infer<typeof tapQueryInputSchema>;
export type TapUploadsInput = z.infer<typeof uploadsSchema>;

const waitMsSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .describe("Wait duration in milliseconds.");

const tapJobTargetFields = {
  ...targetFields,
  jobIdOrUrl: textSchema.describe("TAP async job id or absolute job URL."),
};

export const tapJobSubmitInputSchema = z
  .object({
    ...targetFields,
    maxrec: maxrecSchema.optional(),
    query: textSchema.describe(
      "Exact metadata-backed ADQL query text. Use TOP for a query-level bound; do not use LIMIT.",
    ),
    requestFormat: z
      .enum(tapSyncFormats)
      .optional()
      .describe("TAP RESPONSEFORMAT request value for the async job result."),
    runId: optionalTextSchema.describe("Optional TAP RUNID request value."),
    uploads: uploadsSchema,
  })
  .refine(hasTapTarget, {
    message: "Specify service or url.",
    path: ["service"],
  });
export type TapJobSubmitInput = z.infer<typeof tapJobSubmitInputSchema>;

export const tapJobInputSchema = z
  .object(tapJobTargetFields)
  .superRefine((input, context) => {
    let reference: ReturnType<typeof parseTapJobReference>;

    try {
      reference = parseTapJobReference(input.jobIdOrUrl);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : "Invalid TAP job URL.",
        path: ["jobIdOrUrl"],
      });
      return;
    }

    if (reference.kind === "absolute-url" || hasTapTarget(input)) {
      return;
    }

    context.addIssue({
      code: "custom",
      message: "Specify service or url when jobIdOrUrl is not an absolute URL.",
      path: ["service"],
    });
  });
export type TapJobInput = z.infer<typeof tapJobInputSchema>;

export const tapJobWaitInputSchema = tapJobInputSchema.extend({
  backoff: z.boolean().optional().describe("Increase the poll interval."),
  intervalMs: waitMsSchema
    .optional()
    .describe("Poll interval in milliseconds."),
  maxIntervalMs: waitMsSchema
    .optional()
    .describe("Maximum backoff interval in milliseconds."),
  timeoutMs: waitMsSchema.optional().describe("Wait timeout in milliseconds."),
});
export type TapJobWaitInput = z.infer<typeof tapJobWaitInputSchema>;

export const tapJobFetchInputSchema = tapJobInputSchema.extend({
  format: z.enum(tapOutputFormats).describe("MCP result output format."),
  sourceFormat: z
    .enum(tapSyncFormats)
    .optional()
    .describe("Actual TAP result format for async job output."),
});
export type TapJobFetchInput = z.infer<typeof tapJobFetchInputSchema>;

function hasTapTarget(input: {
  service?: string | undefined;
  url?: string | undefined;
}): boolean {
  return input.service !== undefined || input.url !== undefined;
}

export const presetSchema = z.object({
  name: z.string(),
  url: z.string(),
  label: z.string().optional(),
  syncRequest: z.literal("doQuery").optional(),
});

export const registryServiceSchema = z.object({
  accessUrl: z.string(),
  description: z.string().optional(),
  ivoid: z.string(),
  shortName: z.string().optional(),
  standardId: z.string(),
  title: z.string(),
});

export const availabilitySchema = z.object({
  available: z.boolean(),
  message: z.string().optional(),
});

export const capabilitiesSchema = z.object({
  auth: z.enum(["anonymous", "mixed", "unsupported-auth"]),
  formats: z.array(z.string()),
  languages: z.array(z.string()),
});

export const tableSchema = z.object({
  description: z.string().optional(),
  name: z.string(),
  schema: z.string().optional(),
});

export const columnSchema = z.object({
  datatype: z.string().optional(),
  description: z.string().optional(),
  name: z.string(),
  ucd: z.string().optional(),
  unit: z.string().optional(),
});

export const countDiagnosticsSchema = z.object({
  count: z.number().int().nonnegative(),
});

export const targetDiagnosticsSchema = z.object({
  target: z.object({
    baseUrl: z.string(),
    label: z.string().optional(),
    service: z.string().optional(),
  }),
});

export const tableDiagnosticsSchema = targetDiagnosticsSchema.extend({
  count: z.number().int().nonnegative(),
  table: z.string(),
});

type TapResultFieldShape = {
  [Key in keyof TapResultField]-?: z.ZodType<TapResultField[Key]>;
};

const tapResultFieldShape = {
  name: z.string(),
  datatype: z.string().optional(),
  unit: z.string().optional(),
  ucd: z.string().optional(),
  utype: z.string().optional(),
  description: z.string().optional(),
} satisfies TapResultFieldShape;

export const tapResultFieldSchema = z.object(tapResultFieldShape);

export const tapQueryDataSchema = z.discriminatedUnion("format", [
  z.object({
    content: z.string(),
    fields: z.array(tapResultFieldSchema),
    format: z.enum(["json", "jsonl"]),
    overflow: z.boolean().optional(),
  }),
  z.object({
    content: z.string(),
    format: z.enum(["csv", "tsv", "votable"]),
  }),
]);

export const tapQueryDiagnosticsSchema = targetDiagnosticsSchema.extend({
  durationMs: z.number().nonnegative(),
  effectiveMaxrec: z.number().int().nonnegative(),
  format: z.enum(tapOutputFormats),
  requestFormat: z.enum(tapSyncFormats),
  query: z.string(),
  runId: z.string().optional(),
  uploadCount: z.number().int().nonnegative(),
});

export const tapJobDataSchema = z.object({
  id: z.string(),
  url: z.string(),
});

export const tapJobStatusSchema = z.object({
  errorUrl: z.string().optional(),
  message: z.string().optional(),
  phase: z.string(),
  resultUrl: z.string().optional(),
});

export const tapJobDiagnosticsSchema = targetDiagnosticsSchema.extend({
  job: tapJobDataSchema,
});

export const tapJobSubmitDiagnosticsSchema = targetDiagnosticsSchema.extend({
  effectiveMaxrec: z.number().int().nonnegative(),
  query: z.string(),
  requestFormat: z.enum(tapSyncFormats).optional(),
  runId: z.string().optional(),
  uploadCount: z.number().int().nonnegative(),
});

export const tapJobWaitDiagnosticsSchema = tapJobDiagnosticsSchema.extend({
  observedPhases: z.array(z.string()),
  timeoutMs: z.number().int().nonnegative(),
});

export const tapJobFetchDiagnosticsSchema = tapJobDiagnosticsSchema.extend({
  durationMs: z.number().nonnegative(),
  format: z.enum(tapOutputFormats),
  requestFormat: z.enum(tapSyncFormats),
  sourceFormat: z.enum(tapSyncFormats),
});

export const presetListOutputSchema = z.object({
  data: z.array(presetSchema),
  diagnostics: countDiagnosticsSchema,
});

export const registrySearchOutputSchema = z.object({
  data: z.array(registryServiceSchema),
  diagnostics: z.object({
    count: z.number().int().nonnegative(),
    registryUrl: z.string(),
  }),
});

export const tablesOutputSchema = z.object({
  data: z.array(tableSchema),
  diagnostics: targetDiagnosticsSchema.extend({
    count: z.number().int().nonnegative(),
  }),
});

export const columnsOutputSchema = z.object({
  data: z.array(columnSchema),
  diagnostics: tableDiagnosticsSchema,
});

export const tapQueryOutputSchema = z
  .object({
    data: tapQueryDataSchema,
    diagnostics: tapQueryDiagnosticsSchema,
  })
  .superRefine((output, context) => {
    if (output.data.format !== output.diagnostics.format) {
      context.addIssue({
        code: "custom",
        message: "Query data and diagnostics formats must match.",
      });
    }
  });

export const tapJobFetchOutputSchema = z
  .object({
    data: tapQueryDataSchema,
    diagnostics: tapJobFetchDiagnosticsSchema,
  })
  .superRefine((output, context) => {
    if (output.data.format !== output.diagnostics.format) {
      context.addIssue({
        code: "custom",
        message: "Fetched data and diagnostics formats must match.",
      });
    }
  });
