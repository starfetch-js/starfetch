import {
  Check,
  Copy,
  Download,
  Maximize2,
  MessageSquareText,
  Minimize2,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { StarfetchTableViewV1 } from "../../src/presentation-contract.js";
import {
  type AnalysisScope,
  type StarfetchHostSession,
  type StarfetchHostSnapshot,
} from "./host-ui.js";
import { createTableExport, type DataFormat } from "./table-export.js";

type ActionStatusHandler = (status: string) => void;

type ResultActionsProps = Readonly<{
  analysisRows: StarfetchTableViewV1["rows"];
  analysisScope: AnalysisScope;
  host: StarfetchHostSession;
  hostSnapshot: StarfetchHostSnapshot;
  onStatus: ActionStatusHandler;
  page: number;
  pageCount: number;
  rows: StarfetchTableViewV1["rows"];
  view: StarfetchTableViewV1;
}>;

export function ResultActions({
  analysisRows,
  analysisScope,
  host,
  hostSnapshot,
  onStatus,
  page,
  pageCount,
  rows,
  view,
}: ResultActionsProps) {
  const [openMenu, setOpenMenu] = useState<"copy" | "download" | null>(null);
  const [copyConfirmation, setCopyConfirmation] = useState(0);
  useEffect(() => {
    if (copyConfirmation === 0) return;
    const timeout = window.setTimeout(() => setCopyConfirmation(0), 1_500);
    return () => window.clearTimeout(timeout);
  }, [copyConfirmation]);

  const copyData = async (format: DataFormat) => {
    const tableExport = createTableExport(format, view.columns, rows);
    const copied = await host.copyText(tableExport.text);
    if (copied) {
      onStatus("");
      setCopyConfirmation((confirmation) => confirmation + 1);
    } else {
      onStatus(`Could not copy ${format.toUpperCase()}.`);
    }
  };

  const downloadData = async (format: DataFormat) => {
    const tableExport = createTableExport(format, view.columns, rows);
    const downloaded = await host.saveFile(
      tableExport.filename,
      tableExport.mimeType,
      tableExport.text,
    );
    onStatus(downloaded ? "" : `Could not download ${format.toUpperCase()}.`);
  };

  const runMenuAction = (action: () => Promise<void>) => {
    setOpenMenu(null);
    void action();
  };

  const expanded = hostSnapshot.mode === "fullscreen";
  const toggleFullscreen = async () => {
    const changed = await host.setExpanded(!expanded);
    onStatus(
      changed
        ? ""
        : expanded
          ? "Could not exit fullscreen."
          : "Could not open fullscreen.",
    );
  };

  const analyzeRows = async () => {
    const analyzed = await host.analyzeRows(
      view.title,
      page + 1,
      pageCount,
      analysisScope,
      analysisRows,
    );
    onStatus(
      analysisStatus(analyzed, analysisScope, analysisRows.length, page + 1),
    );
  };

  return (
    <div className="actions">
      <ActionMenu
        confirmed={copyConfirmation > 0}
        icon={
          copyConfirmation > 0 ? (
            <Check aria-hidden="true" size={16} strokeWidth={1.75} />
          ) : (
            <Copy aria-hidden="true" size={16} strokeWidth={1.75} />
          )
        }
        label="Copy data"
        onDismiss={() => setOpenMenu(null)}
        onSelect={(format) => runMenuAction(() => copyData(format))}
        onToggle={() =>
          setOpenMenu((open) => (open === "copy" ? null : "copy"))
        }
        open={openMenu === "copy"}
      />
      <ActionMenu
        icon={<Download aria-hidden="true" size={16} strokeWidth={1.75} />}
        label="Download data"
        onDismiss={() => setOpenMenu(null)}
        onSelect={(format) => runMenuAction(() => downloadData(format))}
        onToggle={() =>
          setOpenMenu((open) => (open === "download" ? null : "download"))
        }
        open={openMenu === "download"}
      />
      {hostSnapshot.canAnalyze ? (
        <button
          aria-label={`Analyze this ${analysisScope}`}
          className="analyze-button"
          onClick={() => void analyzeRows()}
          title={`Analyze this ${analysisScope}`}
          type="button"
        >
          <MessageSquareText aria-hidden="true" size={16} strokeWidth={1.75} />
          <span>Analyze this {analysisScope}</span>
        </button>
      ) : null}
      {hostSnapshot.canExpand ? (
        <button
          aria-label={expanded ? "Exit fullscreen" : "Open fullscreen"}
          className="icon-button"
          onClick={() => void toggleFullscreen()}
          title={expanded ? "Exit fullscreen" : "Open fullscreen"}
          type="button"
        >
          {expanded ? (
            <Minimize2 aria-hidden="true" size={16} strokeWidth={1.75} />
          ) : (
            <Maximize2 aria-hidden="true" size={16} strokeWidth={1.75} />
          )}
        </button>
      ) : null}
    </div>
  );
}

function analysisStatus(
  analyzed: boolean,
  scope: AnalysisScope,
  rowCount: number,
  page: number,
): string {
  if (!analyzed) {
    return `Could not send ${scope === "selection" ? "the selection" : `page ${page}`} to chat.`;
  }
  if (scope === "page") return `Sent page ${page} to chat.`;
  return `Sent ${rowCount} selected ${rowCount === 1 ? "row" : "rows"} to chat.`;
}

function ActionMenu({
  confirmed = false,
  icon,
  label,
  onDismiss,
  onSelect,
  onToggle,
  open,
}: Readonly<{
  confirmed?: boolean;
  icon: React.ReactNode;
  label: "Copy data" | "Download data";
  onDismiss: () => void;
  onSelect: (format: DataFormat) => void;
  onToggle: () => void;
  open: boolean;
}>) {
  const verb = label === "Copy data" ? "Copy as" : "Download";
  const buttonLabel = confirmed ? "Copied data" : label;
  return (
    <div className="action-group">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={buttonLabel}
        className="icon-button"
        onClick={onToggle}
        title={buttonLabel}
        type="button"
      >
        {icon}
      </button>
      {open ? (
        <div
          aria-label={label}
          className="actions-popover"
          onKeyDown={(event) => {
            if (event.key === "Escape") onDismiss();
          }}
          role="menu"
        >
          {(["tsv", "csv", "json"] as const).map((format) => (
            <button
              key={format}
              onClick={() => onSelect(format)}
              role="menuitem"
              type="button"
            >
              {verb} {format.toUpperCase()}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
