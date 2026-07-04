import type {
  QueryOptions,
  TapClientOptions,
  TapOutputFormat,
} from "./index.js";
import { buildTapQueryParams, formatTapResult } from "./index.js";

declare const result: Parameters<typeof formatTapResult>[0];

const queryOptions: QueryOptions = { format: "votable" };
const clientOptions: TapClientOptions = { defaultFormat: "csv" };
const outputFormat: TapOutputFormat = "jsonl";

void queryOptions;
void clientOptions;
void outputFormat;
void formatTapResult(result, outputFormat);

// @ts-expect-error JSON output is produced locally, not requested from TAP.
const jsonQueryOptions: QueryOptions = { format: "json" };
void jsonQueryOptions;

// @ts-expect-error JSONL output is produced locally, not requested from TAP.
const jsonDefaultFormat: TapClientOptions = { defaultFormat: "jsonl" };
void jsonDefaultFormat;

// @ts-expect-error TAP RESPONSEFORMAT only accepts supported request formats.
void buildTapQueryParams("SELECT 1", { format: "jsonl" });
