import { useEffect, useState } from "react";

import type { StarfetchTableViewV1 } from "../../src/presentation-contract.js";
import { formatDurationMs } from "./format-duration.js";
import { type StarfetchHostSession } from "./host-ui.js";
import { ExactQuery, ResultDetails, ResultNotices } from "./result-details.js";
import { PagedResults } from "./paged-results.js";

type ResultsTableProps = Readonly<{
  host: StarfetchHostSession;
  view: StarfetchTableViewV1;
}>;

export function ResultsTable({ host, view }: ResultsTableProps) {
  const [actionStatus, setActionStatus] = useState("");
  const [queryCopyConfirmation, setQueryCopyConfirmation] = useState(0);
  useEffect(() => {
    if (queryCopyConfirmation === 0) return;
    const timeout = window.setTimeout(() => setQueryCopyConfirmation(0), 1_500);
    return () => window.clearTimeout(timeout);
  }, [queryCopyConfirmation]);
  const serviceLabel =
    "target" in view.source ? view.source.target.label : null;
  const query = "query" in view.source ? view.source.query : null;

  const copyQuery = async () => {
    if (query === null) return;
    const copied = await host.copyText(query);
    if (copied) {
      setActionStatus("");
      setQueryCopyConfirmation((confirmation) => confirmation + 1);
    } else {
      setActionStatus("Could not copy ADQL.");
    }
  };

  return (
    <main className="results-shell">
      <header className="results-heading">
        <h1>{view.title}</h1>
        <div className="provenance" aria-label="Result provenance">
          {serviceLabel ? <span>{serviceLabel}</span> : null}
          <span>{view.clipping.sourceRows} source rows</span>
          {"durationMs" in view.source ? (
            <span>{formatDurationMs(view.source.durationMs)}</span>
          ) : null}
          {view.source.tool === "starfetch_tap_query" ? (
            <span>{view.source.effectiveMaxrec}-row request limit</span>
          ) : null}
          {view.source.tool === "starfetch_tap_job_fetch" ? (
            <span>job {view.source.job.id}</span>
          ) : null}
        </div>
      </header>

      <ExactQuery
        copied={queryCopyConfirmation > 0}
        onCopy={() => void copyQuery()}
        view={view}
      />
      {actionStatus ? (
        <p className="action-status" role="status" aria-live="polite">
          {actionStatus}
        </p>
      ) : null}

      {view.state === "empty" ? (
        <>
          <ResultNotices view={view} />
          <section className="empty-state" aria-labelledby="empty-title">
            <h2 id="empty-title">No rows returned</h2>
            <p>The TAP query completed successfully with no rows.</p>
          </section>
        </>
      ) : (
        <PagedResults host={host} onStatus={setActionStatus} view={view} />
      )}
      <ResultDetails view={view} />
    </main>
  );
}
