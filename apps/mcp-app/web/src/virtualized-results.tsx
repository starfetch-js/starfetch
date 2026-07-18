import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { StarfetchTableViewV1 } from "../../src/presentation-contract.js";
import { type StarfetchHostSession } from "./host-ui.js";
import { ResultActions, TableDisplayControl } from "./result-actions.js";
import { ResultNotices } from "./result-details.js";

type TableRow = StarfetchTableViewV1["rows"][number];

export function VirtualizedResults({
  host,
  onStatus,
  view,
}: Readonly<{
  host: StarfetchHostSession;
  onStatus: (status: string) => void;
  view: StarfetchTableViewV1;
}>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const scrollElement = useRef<HTMLDivElement>(null);
  const hostSnapshot = useSyncExternalStore(
    (listener) => host.subscribe(listener),
    () => host.getSnapshot(),
  );
  const columns = useMemo<ColumnDef<TableRow>[]>(
    () =>
      view.columns.map((column) => ({
        accessorFn: (row) => row[column.key] ?? undefined,
        id: column.key,
        header: column.label,
        meta: column,
        sortUndefined: "last",
        sortingFn: isNumericDatatype(column.datatype)
          ? compareNumericCells
          : "alphanumeric",
      })),
    [view.columns],
  );
  const table = useReactTable({
    columns,
    data: view.rows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });
  const sortedRows = table.getRowModel().rows;
  const isVirtualized = sortedRows.length > 20;
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    enabled: isVirtualized,
    estimateSize: () => 40,
    getScrollElement: () => scrollElement.current,
    initialRect: { height: 400, width: 800 },
    overscan: 6,
  });
  const virtualItems = rowVirtualizer.getVirtualItems();
  const renderedRows = isVirtualized
    ? virtualItems.flatMap((item) => {
        const row = sortedRows[item.index];
        return row ? [{ item, row }] : [];
      })
    : sortedRows.map((row) => ({ item: undefined, row }));
  const firstVirtualItem = virtualItems[0];
  const lastVirtualItem = virtualItems.at(-1);
  const topSpacer = firstVirtualItem?.start ?? 0;
  const bottomSpacer = lastVirtualItem
    ? rowVirtualizer.getTotalSize() - lastVirtualItem.end
    : 0;

  return (
    <>
      <ResultActions
        host={host}
        onStatus={onStatus}
        rows={sortedRows.map((row) => row.original)}
        view={view}
      />
      <ResultNotices view={view} />
      <div
        className="table-scroll"
        data-mode={hostSnapshot.mode}
        data-virtualized={isVirtualized ? "true" : "false"}
        ref={scrollElement}
      >
        <table aria-label={view.title}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const column = view.columns.find(
                    (candidate) => candidate.key === header.column.id,
                  );
                  const direction = header.column.getIsSorted();
                  const nextDirection =
                    direction === "asc" ? "descending" : "ascending";
                  return (
                    <th key={header.id} scope="col">
                      <button
                        aria-label={`Sort ${column?.label ?? header.column.id} ${nextDirection}`}
                        onClick={header.column.getToggleSortingHandler()}
                        type="button"
                      >
                        <span>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        </span>
                        <SortIcon direction={direction} />
                      </button>
                      {column ? (
                        <span className="column-meta">
                          {formatColumnMeta(column)}
                        </span>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {topSpacer > 0 ? (
              <tr aria-hidden="true" className="virtual-spacer">
                <td
                  colSpan={view.columns.length}
                  style={{ height: topSpacer }}
                />
              </tr>
            ) : null}
            {renderedRows.map(({ item, row }) => (
              <tr
                data-index={item?.index}
                key={row.id}
                ref={item ? rowVirtualizer.measureElement : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{formatCellValue(cell.getValue())}</td>
                ))}
              </tr>
            ))}
            {bottomSpacer > 0 ? (
              <tr aria-hidden="true" className="virtual-spacer">
                <td
                  colSpan={view.columns.length}
                  style={{ height: bottomSpacer }}
                />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <TableDisplayControl
        host={host}
        hostSnapshot={hostSnapshot}
        onStatus={onStatus}
      />
    </>
  );
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  const iconProps = {
    "aria-hidden": true,
    className: "sort-icon",
    size: 14,
    strokeWidth: 1.75,
  } as const;
  if (direction === "asc") {
    return <ArrowUp {...iconProps} />;
  }
  if (direction === "desc") {
    return <ArrowDown {...iconProps} />;
  }
  return <ChevronsUpDown {...iconProps} />;
}

function formatColumnMeta(
  column: StarfetchTableViewV1["columns"][number],
): string {
  return [column.datatype, column.unit, column.ucd].filter(Boolean).join(" · ");
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return String(value);
}

const numericDatatypes = new Set([
  "bit",
  "double",
  "float",
  "int",
  "long",
  "short",
  "unsignedbyte",
]);

function isNumericDatatype(datatype: string | undefined): boolean {
  return datatype !== undefined && numericDatatypes.has(datatype.toLowerCase());
}

function compareNumericCells(
  first: { getValue: (columnId: string) => unknown },
  second: { getValue: (columnId: string) => unknown },
  columnId: string,
): number {
  const firstValue = Number(first.getValue(columnId));
  const secondValue = Number(second.getValue(columnId));
  if (Number.isFinite(firstValue) && Number.isFinite(secondValue)) {
    return firstValue - secondValue;
  }
  return String(first.getValue(columnId)).localeCompare(
    String(second.getValue(columnId)),
    undefined,
    { numeric: true },
  );
}
