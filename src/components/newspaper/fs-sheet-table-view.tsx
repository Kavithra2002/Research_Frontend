"use client";

import * as React from "react";
import { Check, TableProperties } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type DbAmountDisplay,
  type DbGridRow,
  formatDbAmount,
  formatDbAmountInK,
  formatDbAmountInMn,
  formatDbRatio,
  formatDbUnitForDisplay,
  shouldScaleAmountLabel,
} from "@/lib/newspaper-db";

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
};

function isHighlightableRow(kind: DbGridRow["kind"]): boolean {
  return kind === "data" || kind === "check";
}

function rowBackground(
  highlighted: boolean,
  stripedEven: boolean,
): string {
  if (highlighted) return "bg-lime-500/20";
  return stripedEven ? "bg-muted/10" : "bg-background";
}

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
      title={
        active
          ? `Clear highlight for "${label}"`
          : `Highlight "${label}" to track values across columns`
      }
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

function DescriptionCell({
  label,
  highlighted,
  stripedEven,
  italic,
  onToggle,
  showTick,
}: {
  label: string;
  highlighted: boolean;
  stripedEven: boolean;
  italic?: boolean;
  onToggle: () => void;
  showTick: boolean;
}) {
  return (
    <td
      className={cn(
        "sticky left-0 z-[5] border-b border-r px-3 py-1.5 text-left shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]",
        rowBackground(highlighted, stripedEven),
        highlighted && "ring-1 ring-inset ring-lime-500/35",
      )}
    >
      <div className="flex min-w-[200px] max-w-[320px] items-center gap-2">
        {showTick ? (
          <RowHighlightTick
            active={highlighted}
            onToggle={onToggle}
            label={label}
          />
        ) : null}
        <span className={cn("min-w-0 truncate", italic && "italic")}>{label}</span>
      </div>
    </td>
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
}: FsSheetTableViewProps) {
  const [highlightedRowIdx, setHighlightedRowIdx] = React.useState<
    number | null
  >(null);
  const [activeNote, setActiveNote] = React.useState<{
    label: string;
    year: string;
    value: number;
    notes: NonNullable<DbGridRow["notes"]>;
  } | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setHighlightedRowIdx(null);
    setActiveNote(null);
  }, [rows]);

  const toggleHighlight = React.useCallback((idx: number) => {
    setHighlightedRowIdx((prev) => (prev === idx ? null : idx));
  }, []);

  React.useEffect(() => {
    if (highlightedRowIdx == null || !scrollRef.current) return;
    const row = scrollRef.current.querySelector<HTMLTableRowElement>(
      `tr[data-row-idx="${highlightedRowIdx}"]`,
    );
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightedRowIdx]);

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

  let dataRowCounter = 0;

  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <TableProperties className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h3 className="font-heading text-sm font-semibold tracking-tight">
              {title}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {periodLabel} · {displayUnit}
              {enableNotes ? " · Yellow cells have note breakdowns" : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
            {rows.filter((r) => r.kind === "data").length} line items
          </Badge>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
        <table
          className={cn(
            "w-full min-w-[720px] border-collapse font-variant-numeric tabular-nums",
            compact ? "text-xs" : "text-sm",
          )}
        >
          <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur">
            <tr>
              <th className="sticky left-0 z-30 border-b border-r bg-muted/95 px-3 py-2 text-left font-semibold text-muted-foreground shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                Description
              </th>
              {columnLabels.map((label) => (
                <th
                  key={label}
                  className="border-b px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              if (row.kind === "section") {
                return (
                  <tr key={`${row.label}-${idx}`} className="bg-muted/50">
                    <td
                      colSpan={columnKeys.length + 1}
                      className="border-b px-3 py-2 text-xs font-bold uppercase tracking-wide text-foreground"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }

              if (row.kind === "subsection") {
                return (
                  <tr key={`${row.label}-${idx}`} className="bg-muted/20">
                    <td
                      colSpan={columnKeys.length + 1}
                      className="border-b px-3 py-1.5 text-xs font-semibold uppercase text-muted-foreground"
                    >
                      {row.label}
                    </td>
                  </tr>
                );
              }

              const stripedEven = dataRowCounter % 2 === 1;
              dataRowCounter += 1;
              const highlighted = highlightedRowIdx === idx;
              const showTick = isHighlightableRow(row.kind);

              if (row.kind === "check") {
                return (
                  <tr
                    key={`${row.label}-${idx}`}
                    data-row-idx={idx}
                    className={cn(
                      "text-muted-foreground",
                      highlighted && "ring-1 ring-inset ring-lime-500/35",
                    )}
                  >
                    <DescriptionCell
                      label={row.label}
                      highlighted={highlighted}
                      stripedEven={stripedEven}
                      italic
                      showTick={showTick}
                      onToggle={() => toggleHighlight(idx)}
                    />
                    {columnKeys.map((key) => (
                      <td
                        key={key}
                        className={cn(
                          "border-b px-3 py-1.5 text-right",
                          rowBackground(highlighted, stripedEven),
                          highlighted && "ring-1 ring-inset ring-lime-500/35",
                        )}
                      >
                        {formatCellValue(row.values[key], row.label)}
                      </td>
                    ))}
                  </tr>
                );
              }

              return (
                <tr
                  key={`${row.label}-${idx}`}
                  data-row-idx={idx}
                  className={cn(
                    !highlighted && "hover:bg-muted/30",
                    highlighted && "ring-1 ring-inset ring-lime-500/35",
                  )}
                >
                  <DescriptionCell
                    label={row.label}
                    highlighted={highlighted}
                    stripedEven={stripedEven}
                    showTick={showTick}
                    onToggle={() => toggleHighlight(idx)}
                  />
                  {columnKeys.map((key) => {
                    const value = row.values[key];
                    const empty = value == null;
                    const status = row.statuses?.[key];
                    const confirmedAbsent = status === "confirmed_absent";
                    const noteCell =
                      enableNotes &&
                      row.has_notes &&
                      !empty &&
                      (row.notes_by_year?.[key]?.length ?? row.notes?.length);
                    const cellNotes =
                      row.notes_by_year?.[key] ?? row.notes ?? [];
                    return (
                      <td
                        key={key}
                        className={cn(
                          "border-b px-3 py-1.5 text-right font-mono text-[0.78rem]",
                          rowBackground(highlighted, stripedEven),
                          highlighted && "ring-1 ring-inset ring-lime-500/35",
                          empty && !highlighted && !confirmedAbsent && "text-muted-foreground/50",
                          confirmedAbsent &&
                            "bg-red-200/70 text-red-900 dark:bg-red-950/50 dark:text-red-200",
                          noteCell &&
                            !confirmedAbsent &&
                            "cursor-pointer bg-yellow-400/25 hover:bg-yellow-400/40 dark:bg-yellow-500/20 dark:hover:bg-yellow-500/35",
                          activeNote?.label === row.label &&
                            activeNote?.year === key &&
                            "ring-2 ring-yellow-500/70",
                        )}
                        onClick={
                          noteCell
                            ? () =>
                                setActiveNote({
                                  label: row.label,
                                  year: key,
                                  value: value as number,
                                  notes: cellNotes,
                                })
                            : undefined
                        }
                        title={
                          noteCell
                            ? "Click to view Drivers note breakdown"
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
        </div>

        {activeNote ? (
          <aside className="flex w-full max-w-md shrink-0 flex-col border-l bg-yellow-50/80 dark:bg-yellow-950/30">
            <header className="border-b px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Note breakdown
              </p>
              <p className="text-sm font-medium">{activeNote.label}</p>
              <p className="text-xs text-muted-foreground">
                {activeNote.year} · {formatCellValue(activeNote.value, activeNote.label)}
              </p>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              <table className="w-full text-xs tabular-nums">
                <tbody>
                  {activeNote.notes.map((n) => (
                    <tr
                      key={`${n.label}-${n.row ?? ""}`}
                      className={cn(
                        "border-b",
                        n.label.trim().toLowerCase() === "total" &&
                          "font-semibold border-t-2",
                      )}
                    >
                      <td className="py-1.5 pr-2 text-left">{n.label}</td>
                      <td className="py-1.5 text-right font-mono">
                        {formatCellValue(n.value, n.label)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t p-2">
              <button
                type="button"
                className="w-full rounded-md border px-2 py-1 text-xs hover:bg-muted/50"
                onClick={() => setActiveNote(null)}
              >
                Close
              </button>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
