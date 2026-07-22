import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { StarfetchTableViewV1 } from "../../src/presentation-contract.js";
import { type StarfetchHostSession } from "./host-ui.js";
import { ResultActions } from "./result-actions.js";
import { ResultNotices } from "./result-details.js";

type TableRow = StarfetchTableViewV1["rows"][number];
const desktopPageSize = 100;
const mobilePageSize = 10;

export function PagedResults({
  host,
  onStatus,
  view,
}: Readonly<{
  host: StarfetchHostSession;
  onStatus: (status: string) => void;
  view: StarfetchTableViewV1;
}>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(0);
  const [selectedRowIds, setSelectedRowIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const scrollElement = useRef<HTMLDivElement>(null);
  const hostSnapshot = useSyncExternalStore(
    (listener) => host.subscribe(listener),
    () => host.getSnapshot(),
  );
  const pageSize = hostSnapshot.isMobile ? mobilePageSize : desktopPageSize;
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
    onSortingChange(updater) {
      setSelectedRowIds(new Set());
      setPage(0);
      setSorting(updater);
    },
    state: { sorting },
  });
  const sortedRows = table.getRowModel().rows;
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = sortedRows.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const selectedPageRows = pageRows.filter((row) => selectedRowIds.has(row.id));
  const analysisRows = (
    selectedPageRows.length > 0 ? selectedPageRows : pageRows
  ).map((row) => row.original);
  const analysisScope = selectedPageRows.length > 0 ? "selection" : "page";
  const allPageRowsSelected =
    pageRows.length > 0 && selectedPageRows.length === pageRows.length;
  const somePageRowsSelected =
    selectedPageRows.length > 0 && !allPageRowsSelected;
  useEffect(() => {
    scrollElement.current?.scrollTo?.({ left: 0, top: 0 });
  }, [currentPage]);

  const changePage = (nextPage: number) => {
    setSelectedRowIds(new Set());
    setPage(nextPage);
  };
  const togglePageRows = () => {
    setSelectedRowIds(
      allPageRowsSelected ? new Set() : new Set(pageRows.map((row) => row.id)),
    );
  };
  const toggleRow = (rowId: string) => {
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  return (
    <>
      <ResultActions
        analysisRows={analysisRows}
        analysisScope={analysisScope}
        host={host}
        hostSnapshot={hostSnapshot}
        onStatus={onStatus}
        page={currentPage}
        pageCount={pageCount}
        rows={sortedRows.map((row) => row.original)}
        view={view}
      />
      <ResultNotices view={view} />
      <div
        className="table-scroll"
        data-mobile={hostSnapshot.isMobile ? "true" : undefined}
        data-mode={hostSnapshot.mode}
        ref={scrollElement}
      >
        <table aria-label={view.title}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                <th className="selection-column" scope="col">
                  <SelectionCheckbox
                    checked={allPageRowsSelected}
                    indeterminate={somePageRowsSelected}
                    label="Select all rows on this page"
                    onChange={togglePageRows}
                  />
                </th>
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
            {pageRows.map((row, index) => (
              <tr
                data-selected={selectedRowIds.has(row.id) ? "true" : undefined}
                key={row.id}
              >
                <td className="selection-column">
                  <SelectionCheckbox
                    checked={selectedRowIds.has(row.id)}
                    indeterminate={false}
                    label={`Select row ${currentPage * pageSize + index + 1}`}
                    onChange={() => toggleRow(row.id)}
                  />
                </td>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{formatCellValue(cell.getValue())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <nav aria-label="Table pages" className="table-pagination">
          <div className="pagination-buttons">
            <PageButton
              disabled={currentPage === 0}
              label="First page"
              onClick={() => changePage(0)}
            >
              <ChevronFirst aria-hidden="true" size={16} />
            </PageButton>
            <PageButton
              disabled={currentPage === 0}
              label="Previous page"
              onClick={() => changePage(currentPage - 1)}
            >
              <ChevronLeft aria-hidden="true" size={16} />
            </PageButton>
          </div>
          <span>
            Page {currentPage + 1} of {pageCount} · rows{" "}
            {currentPage * pageSize + 1}–
            {currentPage * pageSize + pageRows.length} of {sortedRows.length}
          </span>
          <div className="pagination-buttons">
            <PageButton
              disabled={currentPage === pageCount - 1}
              label="Next page"
              onClick={() => changePage(currentPage + 1)}
            >
              <ChevronRight aria-hidden="true" size={16} />
            </PageButton>
            <PageButton
              disabled={currentPage === pageCount - 1}
              label="Last page"
              onClick={() => changePage(pageCount - 1)}
            >
              <ChevronLast aria-hidden="true" size={16} />
            </PageButton>
          </div>
        </nav>
      ) : null}
    </>
  );
}

function SelectionCheckbox({
  checked,
  indeterminate,
  label,
  onChange,
}: Readonly<{
  checked: boolean;
  indeterminate: boolean;
  label: string;
  onChange: () => void;
}>) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      aria-label={label}
      checked={checked}
      onChange={onChange}
      ref={input}
      type="checkbox"
    />
  );
}

function PageButton({
  children,
  disabled,
  label,
  onClick,
}: Readonly<{
  children: React.ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      aria-label={label}
      className="icon-button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
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
