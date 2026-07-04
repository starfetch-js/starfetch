/** TAP service response formats Starfetch can request directly from `/sync`. */
export const tapSyncFormats = ["votable", "csv", "tsv"] as const;
/** TAP service response format Starfetch can request directly from `/sync`. */
export type TapSyncFormat = (typeof tapSyncFormats)[number];

/** User-facing output formats Starfetch can pass through or convert to. */
export const tapOutputFormats = [
  "votable",
  "csv",
  "tsv",
  "json",
  "jsonl",
] as const;
/** User-facing output format Starfetch can pass through or convert to. */
export type TapOutputFormat = (typeof tapOutputFormats)[number];

/** Output format names that may be advertised by TAP capabilities. */
export const tapServiceFormats = [
  "votable",
  "csv",
  "tsv",
  "json",
  "jsonl",
  "text",
] as const;
/** Output format name that may be advertised by TAP capabilities. */
export type TapServiceFormat = (typeof tapServiceFormats)[number];

/**
 * Choose the TAP request format needed to produce a local output format.
 *
 * JSON and JSONL are derived from VOTable rows, so they request VOTable from
 * the remote TAP service.
 */
export function tapRequestFormatForOutput(
  format: TapOutputFormat,
): TapSyncFormat {
  if (format === "json" || format === "jsonl") {
    return "votable";
  }

  return format;
}
