import { TapParseError } from "./errors.js";

/** Parsed status for a TAP UWS async job. */
export type TapJobStatus = {
  /** UWS phase such as `PENDING`, `EXECUTING`, `COMPLETED`, or `ERROR`. */
  phase: string;
  /** Primary result URL when advertised by the job document. */
  resultUrl?: string;
  /** Error detail URL when an error summary is present. */
  errorUrl?: string;
  /** Error message from the UWS job document, when present. */
  message?: string;
};

/** Parse a UWS job document into Starfetch's public job status shape. */
export function parseUwsJobStatus(xml: string, jobUrl: URL): TapJobStatus {
  const phase = extractElementText(xml, "phase");

  if (phase === undefined || phase === "") {
    throw new TapParseError("TAP async job document did not include a phase");
  }

  const status: TapJobStatus = { phase };
  const resultUrl = extractResultUrl(xml, jobUrl);

  if (resultUrl !== undefined) {
    status.resultUrl = resultUrl;
  }

  const message = extractErrorMessage(xml);

  if (message !== undefined) {
    status.errorUrl = new URL("error", `${jobUrl.href}/`).href;
    status.message = message;
  }

  return status;
}

function extractElementText(
  xml: string,
  localName: string,
): string | undefined {
  const pattern = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${localName}>`,
    "i",
  );
  const match = pattern.exec(xml);

  if (match?.[1] === undefined) {
    return undefined;
  }

  return stripXmlTags(match[1]).trim();
}

function stripXmlTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

function extractResultUrl(xml: string, jobUrl: URL): string | undefined {
  const resultPattern =
    /<(?:[A-Za-z_][\w.-]*:)?result\b([^>]*?)(?:\/>|>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?result>)/gi;

  for (const match of xml.matchAll(resultPattern)) {
    const attributes = match[1] ?? "";

    if (extractAttribute(attributes, "id") === "result") {
      const href =
        extractAttribute(attributes, "href") ??
        extractAttribute(attributes, "xlink:href");

      return href === undefined
        ? undefined
        : new URL(href, `${jobUrl.href}/`).href;
    }
  }

  return undefined;
}

function extractErrorMessage(xml: string): string | undefined {
  const errorSummary =
    /<(?:[A-Za-z_][\w.-]*:)?errorSummary\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?errorSummary>/i.exec(
      xml,
    )?.[1];

  if (errorSummary === undefined) {
    return undefined;
  }

  return extractElementText(errorSummary, "message");
}

function extractAttribute(
  attributes: string,
  attributeName: string,
): string | undefined {
  const escapedName = attributeName.replace(":", "\\:");
  const pattern = new RegExp(`\\b${escapedName}\\s*=\\s*["']([^"']*)["']`, "i");

  return pattern.exec(attributes)?.[1];
}
