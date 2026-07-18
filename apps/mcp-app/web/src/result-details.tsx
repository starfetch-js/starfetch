import { ChevronRight, Copy } from "lucide-react";
import { Fragment, useEffect, useState, type CSSProperties } from "react";

import type { StarfetchTableViewV1 } from "../../src/presentation-contract.js";
import {
  highlightAdql,
  type AdqlToken,
  type HighlightedAdql,
} from "./adql-highlight.js";

type ResultDetailsProps = Readonly<{ view: StarfetchTableViewV1 }>;
type ExactQueryProps = ResultDetailsProps & Readonly<{ onCopy: () => void }>;

export function ExactQuery({ onCopy, view }: ExactQueryProps) {
  const query =
    view.source.tool === "starfetch_tap_query" ? view.source.query : null;
  const [highlighted, setHighlighted] = useState<HighlightedAdql>();
  useEffect(() => {
    let active = true;
    setHighlighted(undefined);
    if (query !== null) {
      void highlightAdql(query)
        .then((result) => {
          if (active) setHighlighted(result);
        })
        .catch(() => {
          // Plain text remains visible when highlighting is unavailable.
        });
    }
    return () => {
      active = false;
    };
  }, [query]);

  if (view.source.tool !== "starfetch_tap_query") {
    return null;
  }
  return (
    <section aria-label="Exact ADQL" className="query-panel">
      <header>
        <h2>ADQL</h2>
        <button
          aria-label="Copy ADQL"
          className="icon-button"
          onClick={onCopy}
          title="Copy ADQL"
          type="button"
        >
          <Copy aria-hidden="true" size={16} strokeWidth={1.75} />
        </button>
      </header>
      <pre className={highlighted ? "shiki" : undefined}>
        <code>
          {highlighted ? (
            <HighlightedQuery lines={highlighted} />
          ) : (
            view.source.query
          )}
        </code>
      </pre>
    </section>
  );
}

function HighlightedQuery({ lines }: { lines: HighlightedAdql }) {
  return lines.map((line, lineIndex) => (
    <Fragment key={lineIndex}>
      {line.map((token, tokenIndex) => (
        <span key={tokenIndex} style={tokenStyle(token)}>
          {token.content}
        </span>
      ))}
      {lineIndex < lines.length - 1 ? "\n" : null}
    </Fragment>
  ));
}

function tokenStyle(token: AdqlToken): CSSProperties {
  return {
    "--sf-syntax-dark": token.darkColor,
    "--sf-syntax-light": token.lightColor,
    fontStyle: token.fontStyle & 1 ? "italic" : undefined,
    fontWeight: token.fontStyle & 2 ? "bold" : undefined,
    textDecoration: token.fontStyle & 4 ? "underline" : undefined,
  } as CSSProperties;
}

export function ResultNotices({ view }: ResultDetailsProps) {
  const overflow = "overflow" in view.source && view.source.overflow === true;
  const clipped = view.clipping.reasons.length > 0;
  if (!overflow && !clipped) {
    return null;
  }

  return (
    <section className="notices" aria-label="Result notices">
      <div className="notice-badges">
        {overflow ? <strong>TAP overflow</strong> : null}
        {clipped ? <strong>Presentation clipped</strong> : null}
      </div>
      {clipped ? (
        <p>
          {view.rows.length} of {view.clipping.sourceRows} source rows retained
          for display.
        </p>
      ) : null}
    </section>
  );
}

export function ResultDetails({ view }: ResultDetailsProps) {
  return (
    <section className="result-details" aria-label="Result details">
      <details>
        <SummaryLabel>Column details</SummaryLabel>
        <div className="column-details">
          {view.columns.map((column) => (
            <section key={column.key}>
              <h3>{column.label}</h3>
              <dl>
                <Detail label="Key" value={column.key} />
                <Detail label="Datatype" value={column.datatype} />
                <Detail label="Unit" value={column.unit} />
                <Detail label="UCD" value={column.ucd} />
                <Detail label="UTYPE" value={column.utype} />
              </dl>
              {column.description ? <p>{column.description}</p> : null}
            </section>
          ))}
        </div>
      </details>
      <details>
        <SummaryLabel>
          {isRequestSource(view.source) ? "Request details" : "Source details"}
        </SummaryLabel>
        <SourceDetails source={view.source} />
      </details>
    </section>
  );
}

function SourceDetails({ source }: { source: StarfetchTableViewV1["source"] }) {
  if (source.tool === "starfetch_list_presets") {
    return <p>Starfetch built-in TAP service presets.</p>;
  }
  if (source.tool === "starfetch_registry_search") {
    return (
      <dl>
        <Detail label="Registry" value={source.registryUrl} />
      </dl>
    );
  }

  return (
    <div className="source-details">
      <dl>
        <Detail label="Service" value={source.target.label} />
        <Detail label="TAP URL" value={source.target.baseUrl} />
        <Detail label="Preset" value={source.target.service} />
        {source.tool === "starfetch_tap_columns" ? (
          <Detail label="Table" value={source.table} />
        ) : null}
        {source.tool === "starfetch_tap_query" ? (
          <>
            <Detail
              label="Effective limit"
              value={`${source.effectiveMaxrec} rows`}
            />
            <Detail
              label="Response format"
              value={formatName(source.requestFormat)}
            />
            <Detail label="Table view" value={formatName(source.format)} />
            <Detail label="Duration" value={`${source.durationMs} ms`} />
            <Detail label="Run ID" value={source.runId} />
          </>
        ) : null}
        {source.tool === "starfetch_tap_job_fetch" ? (
          <>
            <Detail label="Job ID" value={source.job.id} />
            <Detail label="Job URL" value={source.job.url} />
            <Detail
              label="Source format"
              value={formatName(source.sourceFormat)}
            />
            <Detail label="Table view" value={formatName(source.format)} />
            <Detail label="Duration" value={`${source.durationMs} ms`} />
          </>
        ) : null}
      </dl>
    </div>
  );
}

function SummaryLabel({ children }: { children: string }) {
  return (
    <summary>
      <ChevronRight
        aria-hidden="true"
        className="summary-chevron"
        size={16}
        strokeWidth={1.75}
      />
      {children}
    </summary>
  );
}

function isRequestSource(source: StarfetchTableViewV1["source"]): boolean {
  return (
    source.tool === "starfetch_tap_query" ||
    source.tool === "starfetch_tap_job_fetch"
  );
}

function formatName(format: string): string {
  if (format === "votable") return "VOTable";
  return format.toUpperCase();
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) {
  if (value === undefined || value === "") {
    return null;
  }
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
