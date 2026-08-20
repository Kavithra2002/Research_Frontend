"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Search, StickyNote, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  type DbAmountDisplay,
  type DbGridRow,
  filterDbGridRows,
  formatDbAmount,
  formatDbAmountInK,
  formatDbAmountInMn,
  formatDbUnitForDisplay,
  shouldScaleAmountLabel,
} from "@/lib/newspaper-db";
import { NoteCaptureDialog } from "@/components/newspaper/note-capture-dialog";
import type { NoteCaptureYearEntry } from "@/components/newspaper/note-capture-dialog";
import {
  buildNoteBreakdownLines,
  type NoteEntityPanel,
} from "@/components/newspaper/extracted-note-table";
import { TruncatedDescriptionCell } from "@/components/newspaper/truncated-table-label";
import {
  descriptionColumnStyle,
  DescriptionColumnResizeArea,
  DescriptionColumnResizeOverlay,
  ResizableDescriptionHeader,
  STICKY_DESCRIPTION_EDGE,
  useResizableDescriptionWidth,
} from "@/components/newspaper/resizable-description-column";

const SUBSECTION_ROW_BG = "bg-sky-950/90 dark:bg-sky-950";
const SUBSECTION_LABEL_CLASS = cn(
  SUBSECTION_ROW_BG,
  "border-sky-800/50 text-sky-200 dark:border-sky-900/70 dark:text-sky-300",
);
const SUBSECTION_SPAN_CLASS = cn(
  SUBSECTION_ROW_BG,
  "border-sky-900/40 dark:border-sky-900/60",
);

type NotesSheetTableViewProps = {
  periodLabel: string;
  unit: string;
  years: number[];
  rows: DbGridRow[];
  className?: string;
  amountDisplay?: DbAmountDisplay;
  onAmountDisplayChange?: (display: DbAmountDisplay) => void;
  companySlug?: string;
  /** summary = manual expand; detailed = all note breakdowns open */
  detailLevel?: "summary" | "detailed";
  /** Global Group / Bank for all expanded note sub-items */
  noteEntity?: NoteEntityPanel;
};

function formatCellValue(
  value: number | null | undefined,
  label: string | undefined,
  amountDisplay: DbAmountDisplay,
): string {
  if (label && !shouldScaleAmountLabel(label)) {
    return formatDbAmount(value);
  }
  if (amountDisplay === "raw") return formatDbAmount(value);
  return amountDisplay === "mn"
    ? formatDbAmountInMn(value)
    : formatDbAmountInK(value);
}

function rowBackground(stripedEven: boolean): string {
  return stripedEven ? "bg-muted/10" : "bg-background";
}

export function NotesSheetTableView({
  periodLabel,
  unit,
  years,
  rows,
  className,
  amountDisplay = "raw",
  onAmountDisplayChange,
  companySlug,
  detailLevel = "summary",
  noteEntity = "group",
}: NotesSheetTableViewProps) {
  "use no memo";
  const [rowSearchQuery, setRowSearchQuery] = React.useState("");
  const [captureDialog, setCaptureDialog] = React.useState<{
    label: string;
    year: string;
    years: NoteCaptureYearEntry[];
  } | null>(null);
  const [expandedRowLabels, setExpandedRowLabels] = React.useState<Set<string>>(
    () => new Set(),
  );
  /** Hovered row key so Description → far year cells stay aligned visually. */
  const [hoveredRowKey, setHoveredRowKey] = React.useState<string | null>(null);
  const [isPanning, setIsPanning] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const headerScrollRef = React.useRef<HTMLDivElement>(null);
  const sectionRef = React.useRef<HTMLElement>(null);
  const syncingScrollRef = React.useRef(false);
  const wheelCleanupRef = React.useRef<(() => void) | null>(null);
  const [containerWidth, setContainerWidth] = React.useState(0);
  const panState = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
    moved: boolean;
  } | null>(null);

  const setScrollNode = React.useCallback((el: HTMLDivElement | null) => {
    wheelCleanupRef.current?.();
    wheelCleanupRef.current = null;
    scrollRef.current = el;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      const canScrollX = el.scrollWidth > el.clientWidth + 8;
      const dominantX = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (dominantX && canScrollX) {
        event.preventDefault();
        el.scrollLeft += event.deltaX;
        if (headerScrollRef.current) {
          headerScrollRef.current.scrollLeft = el.scrollLeft;
        }
        return;
      }
      if (event.shiftKey && canScrollX) {
        event.preventDefault();
        el.scrollLeft += event.deltaY;
        if (headerScrollRef.current) {
          headerScrollRef.current.scrollLeft = el.scrollLeft;
        }
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    wheelCleanupRef.current = () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const columnKeys = React.useMemo(() => years.map(String), [years]);

  const YEAR_COL_COMPACT = 96;

  React.useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const defaultDescriptionWidth = 272;
  const { width: descriptionWidth, onResizePointerDown, resetWidth } =
    useResizableDescriptionWidth(defaultDescriptionWidth);

  const baseTableWidth =
    descriptionWidth + columnKeys.length * YEAR_COL_COMPACT;
  const yearColWidth =
    columnKeys.length > 0 && containerWidth > baseTableWidth
      ? Math.max(
          YEAR_COL_COMPACT,
          Math.floor((containerWidth - descriptionWidth) / columnKeys.length),
        )
      : YEAR_COL_COMPACT;
  const tableMinWidth = descriptionWidth + columnKeys.length * yearColWidth;
  const tableWidth =
    containerWidth > tableMinWidth ? containerWidth : tableMinWidth;

  const widthForYear = React.useCallback(
    (_year: string) => yearColWidth,
    [yearColWidth],
  );

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

  const clearDocumentOverscrollLock = React.useCallback(() => {
    document.documentElement.style.removeProperty("overscroll-behavior-x");
    document.body.style.removeProperty("overscroll-behavior-x");
  }, []);

  const lockDocumentOverscroll = React.useCallback(() => {
    document.documentElement.style.overscrollBehaviorX = "none";
    document.body.style.overscrollBehaviorX = "none";
  }, []);

  const getPageScroller = React.useCallback((): HTMLElement | null => {
    return scrollRef.current;
  }, []);

  const onTablePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "button, a, input, select, textarea, [data-no-pan], [role='button']",
        )
      ) {
        return;
      }
      const el = getPageScroller();
      if (!el) return;
      // Track only — capture after drag threshold so row clicks still fire.
      panState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScrollLeft: el.scrollLeft,
        startScrollTop: el.scrollTop,
        moved: false,
      };
    },
    [getPageScroller],
  );

  const onTablePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = panState.current;
      const el = getPageScroller();
      if (!state || !el || state.pointerId !== event.pointerId) return;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (!state.moved) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        state.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        lockDocumentOverscroll();
        setIsPanning(true);
      }
      event.preventDefault();
      el.scrollLeft = state.startScrollLeft - dx;
      el.scrollTop = state.startScrollTop - dy;
    },
    [getPageScroller, lockDocumentOverscroll],
  );

  const endTablePan = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = panState.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const wasDragging = state.moved;
      panState.current = null;
      setIsPanning(false);
      clearDocumentOverscrollLock();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (wasDragging) {
        event.preventDefault();
      }
    },
    [clearDocumentOverscrollLock],
  );

  React.useEffect(() => {
    return () => {
      clearDocumentOverscrollLock();
    };
  }, [clearDocumentOverscrollLock]);

  const filteredRows = React.useMemo(
    () => filterDbGridRows(rows, rowSearchQuery),
    [rows, rowSearchQuery],
  );

  const isFiltering = rowSearchQuery.trim().length > 0;

  React.useEffect(() => {
    setRowSearchQuery("");
    setCaptureDialog(null);
    setExpandedRowLabels(new Set());
  }, [rows]);

  React.useEffect(() => {
    setCaptureDialog(null);
    if (detailLevel !== "detailed") {
      setExpandedRowLabels(new Set());
    }
  }, [rowSearchQuery, detailLevel]);

  // Detailed view: expand every parent that has extracted note tables.
  React.useEffect(() => {
    if (detailLevel !== "detailed") return;
    const labels = rows
      .filter((row) =>
        Object.values(row.note_tables_by_year ?? {}).some(
          (tables) => (tables?.length ?? 0) > 0,
        ),
      )
      .map((row) => row.label);
    setExpandedRowLabels(new Set(labels));
  }, [detailLevel, rows, years]);

  const displayUnit = formatDbUnitForDisplay(unit, amountDisplay);
  const colSpan = columnKeys.length + 1;

  const openCaptureForRow = React.useCallback(
    (row: DbGridRow) => {
      if (!row.has_notes) return;
      const hasExtractedTables = columnKeys.some(
        (key) => (row.note_tables_by_year?.[key]?.length ?? 0) > 0,
      );
      if (hasExtractedTables) {
        setCaptureDialog(null);
        setExpandedRowLabels((current) => {
          const next = new Set(current);
          if (next.has(row.label)) next.delete(row.label);
          else next.add(row.label);
          return next;
        });
        return;
      }
      const entries = columnKeys.map((key) => ({
        year: key,
        source: row.note_source_by_year?.[key] ?? null,
      }));
      const firstWithCapture =
        entries.find((e) => e.source)?.year ?? entries[0]?.year ?? "";
      setCaptureDialog({
        label: row.label,
        year: firstWithCapture,
        years: entries,
      });
    },
    [columnKeys],
  );

  let dataRowCounter = 0;

  return (
    <section
      ref={sectionRef}
      className={cn(
        "flex min-w-0 w-full flex-col rounded-xl border bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      {/* One sticky block = toolbar + year row (no gap, no bleed-through). */}
      <div className="sticky top-0 z-40 bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <StickyNote className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h3 className="font-heading text-sm font-semibold tracking-tight">
                Notes
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                {periodLabel} · {displayUnit} · Use the drop button next to a
                description to expand its note table
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
            {onAmountDisplayChange ? (
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
          </div>
        </header>

        <div
          ref={headerScrollRef}
          className="overflow-x-auto overscroll-x-none border-b bg-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onScroll={() => syncHorizontalScroll("header")}
        >
          <table
            className="w-full table-fixed border-separate border-spacing-0 text-sm font-variant-numeric tabular-nums"
            style={{ width: tableWidth, minWidth: tableMinWidth }}
          >
            <colgroup>
              <col
                style={{
                  width: descriptionWidth,
                  minWidth: descriptionWidth,
                  maxWidth: descriptionWidth,
                }}
              />
              {columnKeys.map((key) => {
                const w = widthForYear(key);
                return (
                  <col
                    key={`head-${key}`}
                    style={{ width: w, minWidth: w, maxWidth: w }}
                  />
                );
              })}
            </colgroup>
            <thead>
              <tr>
                <ResizableDescriptionHeader
                  width={descriptionWidth}
                  className={cn(
                    "sticky left-0 z-40 bg-muted px-3 py-2 text-left font-semibold text-muted-foreground",
                    STICKY_DESCRIPTION_EDGE,
                  )}
                />
                {columnKeys.map((label) => (
                  <th
                    key={label}
                    className="bg-muted px-3 py-2 text-right font-semibold whitespace-nowrap text-muted-foreground"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
      </div>

      <div className="relative min-w-0 overscroll-x-none">
        <div
          ref={setScrollNode}
          className={cn(
            "min-w-0 overflow-x-auto overscroll-x-none",
            isPanning && "cursor-grabbing select-none touch-none",
          )}
          onScroll={() => syncHorizontalScroll("body")}
          onPointerDown={onTablePointerDown}
          onPointerMove={onTablePointerMove}
          onPointerUp={endTablePan}
          onPointerCancel={endTablePan}
        >
        <DescriptionColumnResizeArea>
          <table
            className="w-full table-fixed border-separate border-spacing-0 text-sm font-variant-numeric tabular-nums"
            style={{ width: tableWidth, minWidth: tableMinWidth }}
          >
            <colgroup>
              <col
                style={{
                  width: descriptionWidth,
                  minWidth: descriptionWidth,
                  maxWidth: descriptionWidth,
                }}
              />
              {columnKeys.map((key) => {
                const w = widthForYear(key);
                return (
                  <col
                    key={`body-${key}`}
                    style={{ width: w, minWidth: w, maxWidth: w }}
                  />
                );
              })}
            </colgroup>
            <tbody key={`notes-entity-${noteEntity}`}>
              {filteredRows.length === 0 && isFiltering ? (
                <tr>
                  <td
                    colSpan={colSpan}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    No line items match &ldquo;{rowSearchQuery.trim()}&rdquo;
                  </td>
                </tr>
              ) : null}
              {filteredRows.map((row, idx) => {
                if (row.kind === "section") {
                  return null;
                }

                if (row.kind === "subsection") {
                  return (
                    <tr
                      key={`${row.label}-${idx}`}
                      className={SUBSECTION_ROW_BG}
                    >
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
                const hasExtractedTables = columnKeys.some(
                  (key) => (row.note_tables_by_year?.[key]?.length ?? 0) > 0,
                );
                const isCheck = row.kind === "check";
                const expanded = expandedRowLabels.has(row.label);
                const descriptionActive =
                  captureDialog?.label === row.label || expanded;
                const breakdownLines =
                  expanded && hasExtractedTables
                    ? buildNoteBreakdownLines(
                        row.note_tables_by_year,
                        columnKeys,
                        noteEntity,
                      )
                    : [];

                return (
                  <React.Fragment key={`${row.label}-${idx}`}>
                    <tr
                      data-row-idx={idx}
                      data-row-key={`parent-${idx}`}
                      onMouseEnter={() => setHoveredRowKey(`parent-${idx}`)}
                      onMouseLeave={() => setHoveredRowKey(null)}
                      className={cn(
                        hoveredRowKey === `parent-${idx}` &&
                          "bg-sky-500/10 dark:bg-sky-400/10",
                      )}
                    >
                      <td
                        data-no-pan
                        className={cn(
                          "sticky left-0 z-30 border-b p-0 text-left transition-colors",
                          STICKY_DESCRIPTION_EDGE,
                          stripedEven ? "bg-muted" : "bg-card",
                          hoveredRowKey === `parent-${idx}` &&
                            "bg-sky-500/15 dark:bg-sky-400/15",
                          descriptionActive &&
                            "ring-2 ring-inset ring-sky-500/50",
                        )}
                        style={descriptionColumnStyle(descriptionWidth)}
                      >
                        <TruncatedDescriptionCell
                          className="px-3 py-1.5"
                          label={row.label}
                          labelClassName={
                            isCheck ? "italic text-muted-foreground" : undefined
                          }
                          leading={
                            hasExtractedTables ? (
                              <button
                                type="button"
                                data-no-pan
                                className={cn(
                                  "inline-flex size-5 shrink-0 items-center justify-center rounded border border-border/70 bg-background/80 text-muted-foreground shadow-sm",
                                  "hover:bg-muted hover:text-foreground",
                                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                                  expanded && "bg-muted text-foreground",
                                )}
                                aria-expanded={expanded}
                                aria-label={
                                  expanded
                                    ? `Collapse note table for ${row.label}`
                                    : `Expand note table for ${row.label}`
                                }
                                title={
                                  expanded
                                    ? "Collapse note table"
                                    : "Expand note table"
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openCaptureForRow(row);
                                }}
                              >
                                {expanded ? (
                                  <ChevronDown className="size-3.5" />
                                ) : (
                                  <ChevronRight className="size-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="size-5 shrink-0" aria-hidden />
                            )
                          }
                        />
                      </td>
                      {columnKeys.map((key) => {
                        // Prefer stored BANK map when Entity=Bank; else GROUP (values).
                        const value =
                          noteEntity === "bank"
                            ? (row.values_bank?.[key] ?? row.values[key])
                            : row.values[key];
                        const empty = value == null;
                        const status = row.statuses?.[key];
                        const confirmedAbsent = status === "confirmed_absent";
                        const parentHovered = hoveredRowKey === `parent-${idx}`;

                        return (
                          <td
                            key={key}
                            className={cn(
                              "border-b px-3 py-1.5 text-right font-mono text-[0.78rem] transition-colors",
                              parentHovered
                                ? "bg-sky-500/10 dark:bg-sky-400/10"
                                : rowBackground(stripedEven),
                              empty &&
                                !confirmedAbsent &&
                                "text-muted-foreground/50",
                              confirmedAbsent &&
                                "bg-red-200/70 text-red-900 dark:bg-red-950/50 dark:text-red-200",
                            )}
                            title={
                              confirmedAbsent
                                ? "Not found in annual report"
                                : undefined
                            }
                          >
                            {formatCellValue(value, row.label, amountDisplay)}
                          </td>
                        );
                      })}
                    </tr>
                    {breakdownLines.map((line, lineIdx) => {
                      const style =
                        typeof line.style === "string"
                          ? line.style.toLowerCase()
                          : "";
                      const isTotal = style === "total" || /^totals?\b/i.test(line.label);
                      const isSubtotal = style === "subtotal";
                      const isSection = style === "section";
                      const childEven = lineIdx % 2 === 1;
                      const childKey = `child-${idx}-${lineIdx}`;
                      const childHovered = hoveredRowKey === childKey;

                      return (
                        <tr
                          key={`${row.label}-note-${lineIdx}-${line.label}`}
                          data-note-breakdown=""
                          data-row-key={childKey}
                          onMouseEnter={() => setHoveredRowKey(childKey)}
                          onMouseLeave={() => setHoveredRowKey(null)}
                          className={cn(
                            childHovered && "bg-sky-500/10 dark:bg-sky-400/10",
                          )}
                        >
                          <td
                            data-no-pan
                            className={cn(
                              "sticky left-0 z-30 border-b p-0 text-left transition-colors",
                              STICKY_DESCRIPTION_EDGE,
                              isTotal
                                ? "bg-amber-100/80 dark:bg-amber-950/40"
                                : isSection
                                  ? "bg-teal-950/30"
                                  : childEven
                                    ? "bg-muted/40"
                                    : "bg-card",
                              childHovered &&
                                "bg-sky-500/15 dark:bg-sky-400/15",
                            )}
                            style={descriptionColumnStyle(descriptionWidth)}
                          >
                            <div
                              className={cn(
                                "flex items-start gap-1.5 border-l-2 border-border/60 py-1.5 pl-5 pr-3 text-[0.78rem] leading-snug",
                                isTotal && "font-bold text-amber-950 dark:text-amber-50",
                                isSubtotal && "font-semibold",
                                isSection && "font-semibold text-teal-100",
                              )}
                              title={line.label}
                            >
                              <span className="min-w-0 break-words">
                                {line.label}
                              </span>
                            </div>
                          </td>
                          {columnKeys.map((key) => {
                            const value = line.values[key];
                            const empty = value == null;
                            return (
                              <td
                                key={key}
                                className={cn(
                                  "border-b px-3 py-1.5 text-right font-mono text-[0.78rem] transition-colors",
                                  childHovered
                                    ? "bg-sky-500/10 dark:bg-sky-400/10"
                                    : isTotal
                                      ? "bg-amber-100/80 font-bold text-amber-950 dark:bg-amber-950/40 dark:text-amber-50"
                                      : isSection
                                        ? "bg-teal-950/20"
                                        : rowBackground(childEven),
                                  empty && "text-muted-foreground/50",
                                  isTotal && !childHovered && "font-bold",
                                )}
                              >
                                {formatCellValue(
                                  value,
                                  line.label,
                                  amountDisplay,
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
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
        showAllYearSlots
      />
    </section>
  );
}
