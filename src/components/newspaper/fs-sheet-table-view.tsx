"use client";

import * as React from "react";
import { Check, Search, TableProperties, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  type DbAmountDisplay,
  type DbGridRow,
  filterDbGridRows,
  formatDbAmount,
  formatDbAmountInK,
  formatDbAmountInMn,
  formatDbRatio,
  formatDbUnitForDisplay,
  shouldScaleAmountLabel,
} from "@/lib/newspaper-db";
import { NoteCaptureDialog } from "@/components/newspaper/note-capture-dialog";
import type { NoteCaptureYearEntry } from "@/components/newspaper/note-capture-dialog";
import { TruncatedDescriptionCell } from "@/components/newspaper/truncated-table-label";
import {
  descriptionColumnStyle,
  DescriptionColumnResizeArea,
  DescriptionColumnResizeOverlay,
  ResizableDescriptionHeader,
  STICKY_DESCRIPTION_EDGE,
  useResizableDescriptionWidth,
} from "@/components/newspaper/resizable-description-column";

type FsSheetTableViewProps = {
  periodLabel: string;
  unit: string;
  columnLabels: string[];
  columnKeys: string[];
  rows: DbGridRow[];
  compact?: boolean;
  className?: string;
  title?: string;
  valueFormat?: "amount" | "ratio";
  enableNotes?: boolean;
  amountDisplay?: DbAmountDisplay;
  onAmountDisplayChange?: (display: DbAmountDisplay) => void;
  showAmountDisplaySelect?: boolean;
  noteSourceByYear?: DbGridRow["note_source_by_year"];
  companySlug?: string;
  /** When true, table grows to full row height and the page scrolls vertically. */
  pageScroll?: boolean;
};

function isHighlightableRow(kind: DbGridRow["kind"]): boolean {
  return kind === "data" || kind === "check";
}

function stickyLabelBg(highlighted: boolean, stripedEven: boolean): string {
  if (highlighted) return "bg-lime-100 dark:bg-lime-950";
  if (stripedEven) return "bg-muted";
  return "bg-card";
}

function valueCellBg(highlighted: boolean, stripedEven: boolean): string {
  if (highlighted) return "bg-lime-500/20";
  if (stripedEven) return "bg-muted/30";
  return "bg-background";
}

/** Major statement blocks (Income statement, Balance sheet, Cash flow). */
const SECTION_ROW_BG = "bg-blue-900 dark:bg-blue-950";
const SECTION_LABEL_CLASS = cn(
  SECTION_ROW_BG,
  "border-blue-800/60 text-blue-50 dark:border-blue-900 dark:text-blue-100",
);
const SECTION_SPAN_CLASS = cn(SECTION_ROW_BG, "border-blue-800/40 dark:border-blue-900");

/** In-statement topic rows (Assets, Adjustments for:, Cash flows from …). */
const SUBSECTION_ROW_BG = "bg-sky-950/90 dark:bg-sky-950";
const SUBSECTION_LABEL_CLASS = cn(
  SUBSECTION_ROW_BG,
  "border-sky-800/50 text-sky-200 dark:border-sky-900/70 dark:text-sky-300",
);
const SUBSECTION_SPAN_CLASS = cn(
  SUBSECTION_ROW_BG,
  "border-sky-900/40 dark:border-sky-900/60",
);

function RowHighlightTick({
  active,
  onToggle,
  label,
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={
        active ? `Clear highlight for ${label}` : `Highlight row ${label}`
      }
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
        active
          ? "border-lime-500/60 bg-lime-500/25 text-lime-700 dark:text-lime-300"
          : "border-muted-foreground/25 bg-muted/30 text-muted-foreground/50 hover:border-lime-500/40 hover:bg-lime-500/10 hover:text-lime-600 dark:hover:text-lime-400",
      )}
    >
      <Check className="size-3" strokeWidth={active ? 2.5 : 2} />
    </button>
  );
}

export function FsSheetTableView({
  periodLabel,
  unit,
  columnLabels,
  columnKeys,
  rows,
  compact = false,
  className,
  title = "Financial statements",
  valueFormat = "amount",
  enableNotes = false,
  amountDisplay = "raw",
  onAmountDisplayChange,
  showAmountDisplaySelect = false,
  noteSourceByYear,
  companySlug,
  pageScroll = false,
}: FsSheetTableViewProps) {
  const [rowSearchQuery, setRowSearchQuery] = React.useState("");
  const [highlightedRowIdx, setHighlightedRowIdx] = React.useState<
    number | null
  >(null);
  const [captureDialog, setCaptureDialog] = React.useState<{
    label: string;
    year: string;
    years: NoteCaptureYearEntry[];
  } | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const headerScrollRef = React.useRef<HTMLDivElement>(null);
  const toolbarRef = React.useRef<HTMLElement>(null);
  const syncingScrollRef = React.useRef(false);
  const [containerWidth, setContainerWidth] = React.useState(0);

  const filteredRows = React.useMemo(
    () => filterDbGridRows(rows, rowSearchQuery),
    [rows, rowSearchQuery],
  );

  const totalDataRows = rows.filter((r) => r.kind === "data").length;
  const filteredDataRows = filteredRows.filter((r) => r.kind === "data").length;
  const isFiltering = rowSearchQuery.trim().length > 0;

  React.useEffect(() => {
    setRowSearchQuery("");
    setHighlightedRowIdx(null);
    setCaptureDialog(null);
  }, [rows]);

  React.useEffect(() => {
    setHighlightedRowIdx(null);
    setCaptureDialog(null);
  }, [rowSearchQuery]);

  const openCaptureForCell = React.useCallback(
    (row: DbGridRow, yearKey: string) => {
      const source =
        row.note_source_by_year?.[yearKey] ?? noteSourceByYear?.[yearKey];
      if (!source) return;
      setCaptureDialog({
        label: row.label,
        year: yearKey,
        years: [
          {
            year: yearKey,
            source,
            tables: row.note_tables_by_year?.[yearKey],
          },
        ],
      });
    },
    [noteSourceByYear],
  );

  const toggleHighlight = React.useCallback((idx: number) => {
    setHighlightedRowIdx((prev) => (prev === idx ? null : idx));
  }, []);

  React.useEffect(() => {
    if (highlightedRowIdx == null || !scrollRef.current) return;
    const row = scrollRef.current.querySelector<HTMLTableRowElement>(
      `[data-row-idx="${highlightedRowIdx}"]`,
    );
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightedRowIdx]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const syncHorizontalScroll = React.useCallback(
    (source: "header" | "body") => {
      if (syncingScrollRef.current) return;
      const headerEl = headerScrollRef.current;
      const bodyEl = scrollRef.current;
      if (!headerEl || !bodyEl) return;
      syncingScrollRef.current = true;
      if (source === "header") bodyEl.scrollLeft = headerEl.scrollLeft;
      else headerEl.scrollLeft = bodyEl.scrollLeft;
      requestAnimationFrame(() => {
        syncingScrollRef.current = false;
      });
    },
    [],
  );

  const formatCellValue = React.useCallback(
    (value: number | null | undefined, label?: string) => {
      if (valueFormat === "ratio") return formatDbRatio(value);
      if (label && !shouldScaleAmountLabel(label)) {
        return formatDbAmount(value);
      }
      if (amountDisplay === "raw") return formatDbAmount(value);
      return amountDisplay === "mn"
        ? formatDbAmountInMn(value)
        : formatDbAmountInK(value);
    },
    [valueFormat, amountDisplay],
  );

  const displayUnit = formatDbUnitForDisplay(unit, amountDisplay);

  const textSize = compact ? "text-xs" : "text-sm";
  let dataRowCounter = 0;

  const baseDescriptionWidth = columnKeys.length > 12 ? 288 : 272;
  const baseDataColWidth = columnKeys.length > 12 ? 112 : 104;
  const { width: descriptionWidth, onResizePointerDown, resetWidth } =
    useResizableDescriptionWidth(baseDescriptionWidth);
  const baseTableWidth =
    descriptionWidth + columnKeys.length * baseDataColWidth;
  const dataColWidth =
    columnKeys.length > 0
      ? Math.max(
          baseDataColWidth,
          containerWidth > baseTableWidth
            ? Math.floor(
                (containerWidth - descriptionWidth) / columnKeys.length,
              )
            : baseDataColWidth,
        )
      : baseDataColWidth;
  const tableWidth =
    containerWidth > baseTableWidth
      ? containerWidth
      : baseTableWidth;

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-card text-card-foreground shadow-sm",
        !pageScroll && "min-h-0 flex-1 overflow-hidden",
        className,
      )}
    >
      {pageScroll ? (
        <div className="sticky top-0 z-40 bg-card shadow-sm">
          <header
            ref={toolbarRef}
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2">
              <TableProperties className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <h3 className="font-heading text-sm font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="text-xs leading-snug text-muted-foreground sm:line-clamp-2">
                  {periodLabel} · {displayUnit}
                  {enableNotes ? " · Yellow cells open note captures" : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={rowSearchQuery}
                  onChange={(e) => setRowSearchQuery(e.target.value)}
                  placeholder="Search line items…"
                  className="h-7 w-44 pl-8 pr-7 text-xs sm:w-52"
                  aria-label="Search line items"
                />
                {rowSearchQuery ? (
                  <button
                    type="button"
                    onClick={() => setRowSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              {showAmountDisplaySelect && onAmountDisplayChange ? (
                <select
                  value={amountDisplay}
                  onChange={(e) =>
                    onAmountDisplayChange(e.target.value as DbAmountDisplay)
                  }
                  className={cn(
                    "h-7 rounded-md border border-input bg-background px-2 text-xs font-medium",
                    "text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  )}
                  aria-label="Number display unit"
                >
                  <option value="raw">Original (LKR &apos;000)</option>
                  <option value="mn">Millions (Mn)</option>
                  <option value="k">Thousands (K)</option>
                </select>
              ) : null}
              <Badge variant="secondary" className="text-[10px]">
                {isFiltering
                  ? `${filteredDataRows} of ${totalDataRows} line items`
                  : `${totalDataRows} line items`}
              </Badge>
            </div>
          </header>
          <div
            ref={headerScrollRef}
            className="overflow-x-auto overscroll-x-none border-b bg-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={() => syncHorizontalScroll("header")}
          >
            <table
              className={cn(
                "table-fixed border-separate border-spacing-0 font-variant-numeric tabular-nums",
                textSize,
              )}
              style={{ minWidth: baseTableWidth, width: tableWidth }}
            >
              <colgroup>
                <col
                  style={{
                    width: descriptionWidth,
                    minWidth: descriptionWidth,
                    maxWidth: descriptionWidth,
                  }}
                />
                {columnKeys.map((key) => (
                  <col
                    key={`head-${key}`}
                    style={{
                      width: dataColWidth,
                      minWidth: dataColWidth,
                      maxWidth: dataColWidth,
                    }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <ResizableDescriptionHeader
                    width={descriptionWidth}
                    className={cn(
                      "sticky left-0 z-40 bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground sm:text-sm",
                      STICKY_DESCRIPTION_EDGE,
                    )}
                  />
                  {columnLabels.map((label) => (
                    <th
                      key={label}
                      className="bg-muted px-2 py-2 text-right text-[11px] font-semibold leading-tight whitespace-nowrap text-muted-foreground sm:px-3 sm:text-xs"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>
        </div>
      ) : (
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <TableProperties className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h3 className="font-heading text-sm font-semibold tracking-tight">
                {title}
              </h3>
              <p className="text-xs leading-snug text-muted-foreground sm:line-clamp-2">
                {periodLabel} · {displayUnit}
                {enableNotes ? " · Yellow cells open note captures" : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={rowSearchQuery}
                onChange={(e) => setRowSearchQuery(e.target.value)}
                placeholder="Search line items…"
                className="h-7 w-44 pl-8 pr-7 text-xs sm:w-52"
                aria-label="Search line items"
              />
              {rowSearchQuery ? (
                <button
                  type="button"
                  onClick={() => setRowSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
            {showAmountDisplaySelect && onAmountDisplayChange ? (
              <select
                value={amountDisplay}
                onChange={(e) =>
                  onAmountDisplayChange(e.target.value as DbAmountDisplay)
                }
                className={cn(
                  "h-7 rounded-md border border-input bg-background px-2 text-xs font-medium",
                  "text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                )}
                aria-label="Number display unit"
              >
                <option value="raw">Original (LKR &apos;000)</option>
                <option value="mn">Millions (Mn)</option>
                <option value="k">Thousands (K)</option>
              </select>
            ) : null}
            <Badge variant="secondary" className="text-[10px]">
              {isFiltering
                ? `${filteredDataRows} of ${totalDataRows} line items`
                : `${totalDataRows} line items`}
            </Badge>
          </div>
        </header>
      )}

      <div
        className={cn(
          "relative min-w-0",
          !pageScroll && "min-h-0 flex-1 overflow-hidden",
        )}
      >
        <div
          ref={scrollRef}
          className={cn(
            "min-w-0",
            pageScroll
              ? "overflow-x-auto overscroll-x-none"
              : "min-h-0 h-full overflow-auto overscroll-contain",
          )}
          onScroll={
            pageScroll ? () => syncHorizontalScroll("body") : undefined
          }
        >
          <DescriptionColumnResizeArea>
          <table
            className={cn(
              "border-separate border-spacing-0 font-variant-numeric tabular-nums table-fixed",
              textSize,
            )}
            style={{ minWidth: baseTableWidth, width: tableWidth }}
          >
            <colgroup>
              <col
                style={{
                  width: descriptionWidth,
                  minWidth: descriptionWidth,
                  maxWidth: descriptionWidth,
                }}
              />
              {columnKeys.map((key) => (
                <col
                  key={key}
                  style={{
                    width: dataColWidth,
                    minWidth: dataColWidth,
                    maxWidth: dataColWidth,
                  }}
                />
              ))}
            </colgroup>
            {!pageScroll ? (
            <thead>
              <tr>
                <ResizableDescriptionHeader
                  width={descriptionWidth}
                  className={cn(
                    "sticky left-0 top-0 z-40 border-b bg-muted px-3 py-2 text-left text-xs font-semibold text-muted-foreground sm:text-sm",
                    STICKY_DESCRIPTION_EDGE,
                  )}
                />
                {columnLabels.map((label) => (
                  <th
                    key={label}
                    className="sticky top-0 z-30 border-b bg-muted px-2 py-2 text-right text-[11px] font-semibold leading-tight whitespace-nowrap text-muted-foreground sm:px-3 sm:text-xs"
                    style={{ width: dataColWidth, minWidth: dataColWidth }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            ) : null}
            <tbody>
              {filteredRows.length === 0 && isFiltering ? (
                <tr>
                  <td
                    colSpan={columnKeys.length + 1}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    No line items match &ldquo;{rowSearchQuery.trim()}&rdquo;
                  </td>
                </tr>
              ) : null}
              {filteredRows.map((row, idx) => {
                if (row.kind === "section") {
                  return (
                    <tr key={`${row.label}-${idx}`} className={SECTION_ROW_BG}>
                      <td
                        className={cn(
                          "sticky left-0 z-30 border-b px-3 py-2 text-xs font-bold uppercase tracking-wide",
                          STICKY_DESCRIPTION_EDGE,
                          SECTION_LABEL_CLASS,
                        )}
                        style={descriptionColumnStyle(descriptionWidth)}
                      >
                        {row.label}
                      </td>
                      <td
                        colSpan={columnKeys.length}
                        className={cn("border-b", SECTION_SPAN_CLASS)}
                        aria-hidden
                      />
                    </tr>
                  );
                }

                if (row.kind === "subsection") {
                  return (
                    <tr key={`${row.label}-${idx}`} className={SUBSECTION_ROW_BG}>
                      <td
                        className={cn(
                          "sticky left-0 z-30 border-b px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
                          STICKY_DESCRIPTION_EDGE,
                          SUBSECTION_LABEL_CLASS,
                        )}
                        style={descriptionColumnStyle(descriptionWidth)}
                      >
                        {row.label}
                      </td>
                      <td
                        colSpan={columnKeys.length}
                        className={cn("border-b", SUBSECTION_SPAN_CLASS)}
                        aria-hidden
                      />
                    </tr>
                  );
                }

                const stripedEven = dataRowCounter % 2 === 1;
                dataRowCounter += 1;
                const highlighted = highlightedRowIdx === idx;
                const showTick = isHighlightableRow(row.kind);
                const isCheck = row.kind === "check";

                return (
                  <tr
                    key={`${row.label}-${idx}`}
                    data-row-idx={idx}
                    className={cn(
                      !highlighted && !isCheck && "hover:bg-muted/20",
                      isCheck && "text-muted-foreground",
                      highlighted && "ring-1 ring-inset ring-lime-500/35",
                    )}
                  >
                    <td
                      className={cn(
                        "sticky left-0 z-30 border-b p-0 text-left align-middle",
                        STICKY_DESCRIPTION_EDGE,
                        stickyLabelBg(highlighted, stripedEven),
                        highlighted && "ring-1 ring-inset ring-lime-500/35",
                      )}
                      style={descriptionColumnStyle(descriptionWidth)}
                    >
                      <TruncatedDescriptionCell
                        className="px-3 py-1.5"
                        label={row.label}
                        labelClassName={isCheck ? "italic" : undefined}
                        leading={
                          showTick ? (
                            <RowHighlightTick
                              active={highlighted}
                              onToggle={() => toggleHighlight(idx)}
                              label={row.label}
                            />
                          ) : (
                            <span className="inline-block size-5 shrink-0" />
                          )
                        }
                      />
                    </td>
                    {columnKeys.map((key) => {
                      const value = row.values[key];
                      const empty = value == null;
                      const status = row.statuses?.[key];
                      const confirmedAbsent = status === "confirmed_absent";
                      const noteCell =
                        enableNotes &&
                        row.has_notes &&
                        !empty &&
                        (row.note_source_by_year?.[key] ??
                          noteSourceByYear?.[key]);

                      return (
                        <td
                          key={key}
                          className={cn(
                            "border-b px-2 py-1.5 text-right align-middle whitespace-nowrap sm:px-3",
                            !isCheck && "font-mono text-[0.78rem]",
                            valueCellBg(highlighted, stripedEven),
                            highlighted && "ring-1 ring-inset ring-lime-500/35",
                            empty &&
                              !highlighted &&
                              !confirmedAbsent &&
                              "text-muted-foreground/50",
                            confirmedAbsent &&
                              "bg-red-200/70 text-red-900 dark:bg-red-950/50 dark:text-red-200",
                            row.has_notes &&
                              enableNotes &&
                              !empty &&
                              !confirmedAbsent &&
                              "bg-yellow-400/25 dark:bg-yellow-500/20",
                            noteCell &&
                              !confirmedAbsent &&
                              "cursor-pointer hover:bg-yellow-400/40 dark:hover:bg-yellow-500/35",
                            captureDialog?.label === row.label &&
                              captureDialog?.year === key &&
                              "ring-2 ring-yellow-500/70",
                          )}
                          style={{ width: dataColWidth, minWidth: dataColWidth }}
                          onClick={
                            noteCell
                              ? () => openCaptureForCell(row, key)
                              : undefined
                          }
                          title={
                            row.has_notes && enableNotes && !empty
                              ? noteCell
                                ? "Click to view note table capture"
                                : "Note table available (capture pending)"
                              : confirmedAbsent
                                ? "Not found in annual report"
                                : undefined
                          }
                        >
                          {formatCellValue(value, row.label)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </DescriptionColumnResizeArea>
        </div>
        <DescriptionColumnResizeOverlay
          width={descriptionWidth}
          onResizePointerDown={onResizePointerDown}
          onReset={resetWidth}
        />
      </div>

      <NoteCaptureDialog
        open={captureDialog != null}
        onOpenChange={(open) => {
          if (!open) setCaptureDialog(null);
        }}
        label={captureDialog?.label ?? ""}
        companySlug={companySlug}
        years={captureDialog?.years ?? []}
        initialYear={captureDialog?.year}
      />
    </section>
  );
}
