import { ChevronsDown, ChevronsUp, Copy, Download } from "lucide-react";
import { useState } from "react";

import type { StarfetchTableViewV1 } from "../../src/presentation-contract.js";
import {
  type StarfetchHostSession,
  type StarfetchHostSnapshot,
} from "./host-ui.js";
import { createTableExport, type DataFormat } from "./table-export.js";

type ActionStatusHandler = (status: string) => void;

type ResultActionsProps = Readonly<{
  host: StarfetchHostSession;
  onStatus: ActionStatusHandler;
  rows: StarfetchTableViewV1["rows"];
  view: StarfetchTableViewV1;
}>;

export function ResultActions({
  host,
  onStatus,
  rows,
  view,
}: ResultActionsProps) {
  const [openMenu, setOpenMenu] = useState<"copy" | "download" | null>(null);

  const copyData = async (format: DataFormat) => {
    const tableExport = createTableExport(format, view.columns, rows);
    const copied = await host.copyText(tableExport.text);
    onStatus(
      copied
        ? `Copied ${format.toUpperCase()}.`
        : `Could not copy ${format.toUpperCase()}.`,
    );
  };

  const downloadData = async (format: DataFormat) => {
    const tableExport = createTableExport(format, view.columns, rows);
    const downloaded = await host.saveFile(
      tableExport.filename,
      tableExport.mimeType,
      tableExport.text,
    );
    onStatus(
      downloaded
        ? `Downloaded ${format.toUpperCase()}.`
        : `Could not download ${format.toUpperCase()}.`,
    );
  };

  const runMenuAction = (action: () => Promise<void>) => {
    setOpenMenu(null);
    void action();
  };

  return (
    <div className="actions">
      <ActionMenu
        icon={<Copy aria-hidden="true" size={16} strokeWidth={1.75} />}
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
    </div>
  );
}

export function TableDisplayControl({
  host,
  hostSnapshot,
  onStatus,
}: Readonly<{
  host: StarfetchHostSession;
  hostSnapshot: StarfetchHostSnapshot;
  onStatus: ActionStatusHandler;
}>) {
  if (!hostSnapshot.canExpand) {
    return null;
  }

  const expanded = hostSnapshot.mode === "fullscreen";
  const toggleExpanded = async () => {
    const changed = await host.setExpanded(!expanded);
    onStatus(
      changed
        ? expanded
          ? "Showing fewer rows."
          : "Showing more rows."
        : expanded
          ? "Could not show fewer rows."
          : "Could not show more rows.",
    );
  };

  return (
    <div
      aria-label="Table display"
      className="table-display-controls"
      role="group"
    >
      <button
        className="table-display-button"
        onClick={() => void toggleExpanded()}
        type="button"
      >
        {expanded ? (
          <ChevronsUp aria-hidden="true" size={16} strokeWidth={1.75} />
        ) : (
          <ChevronsDown aria-hidden="true" size={16} strokeWidth={1.75} />
        )}
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

function ActionMenu({
  icon,
  label,
  onDismiss,
  onSelect,
  onToggle,
  open,
}: Readonly<{
  icon: React.ReactNode;
  label: "Copy data" | "Download data";
  onDismiss: () => void;
  onSelect: (format: DataFormat) => void;
  onToggle: () => void;
  open: boolean;
}>) {
  const verb = label === "Copy data" ? "Copy as" : "Download";
  return (
    <div className="action-group">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="icon-button"
        onClick={onToggle}
        title={label}
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
