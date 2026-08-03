"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { NoteExtractedTable } from "@/lib/newspaper-db";

type ExtractedNoteTablesProps = {
  tables: NoteExtractedTable[];
  className?: string;
  /** Report year shown beside the Group/Bank switch footer. */
  yearLabel?: string;
  /**
   * Size to the full table width with no nested horizontal scrollbar.
   * Used when notes are shown under year columns in the DB grid.
   */
  fitContent?: boolean;
};

type EntityPanel = "group" | "bank";

type SplitNoteTables = {
  group: NoteExtractedTable;
  bank: NoteExtractedTable;
  bankLabel: string;
};

function rowStyleClass(style: NoteExtractedTable["rows"][number]["style"]) {
  const value = typeof style === "string" ? style.toLowerCase() : "";
  if (value === "section") {
    return "bg-teal-950/40 text-teal-50/95 font-semibold";
  }
  if (value === "total") {
    return "bg-amber-950/35 font-bold text-amber-50 border-t border-amber-500/30";
  }
  if (value === "subtotal") {
    return "bg-muted/50 font-semibold";
  }
  if (value === "blank") return "h-5";
  return "";
}

function headerCellTone(text: string): string {
  const normalized = normalizeHeaderCell(text);
  if (
    normalized === "GROUP" ||
    normalized === "BANK" ||
    normalized === "COMPANY"
  ) {
    return "bg-teal-950/55 text-teal-50";
  }
  if (
    /^(19|20)\d{2}/.test(text.trim()) ||
    /rs\.?|lkr|'000/i.test(text)
  ) {
    return "bg-slate-900/80 text-slate-100";
  }
  if (normalized === "NOTE") {
    return "bg-muted/80 text-muted-foreground";
  }
  return "bg-muted/60 text-foreground";
}

function YearBadge({ year }: { year: string }) {
  return (
    <span
      aria-hidden
      className="relative z-10 shrink-0 text-2xl font-semibold tabular-nums leading-none text-muted-foreground/40"
    >
      {year}
    </span>
  );
}

function normalizeHeaderCell(value: string | undefined | null): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseNoteAmount(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = String(raw).replace(/,/g, "").replace(/\s+/g, "").trim();
  if (!s || s === "-" || s === "—" || s === "–") return null;
  const neg = s.startsWith("(") && s.endsWith(")");
  if (neg) s = s.slice(1, -1);
  if (s.startsWith("+")) s = s.slice(1);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export type NoteBreakdownLine = {
  /** Display label (from note table first column). */
  label: string;
  style?: string;
  /** Current-year amount keyed by report year (Group or Bank/Company). */
  values: Record<string, number | null>;
};

export type NoteEntityPanel = "group" | "bank";

/**
 * Prefer GROUP or BANK/COMPANY projection of a note table.
 */
export function resolveNoteEntityTable(
  table: NoteExtractedTable,
  entity: NoteEntityPanel = "group",
): NoteExtractedTable {
  const split = splitGroupBankTable(table);
  if (!split) return table;
  return entity === "bank" ? split.bank : split.group;
}

/**
 * Prefer the GROUP projection of a note table (split from GROUP+BANK when needed).
 */
export function resolveGroupNoteTable(
  table: NoteExtractedTable,
): NoteExtractedTable {
  return resolveNoteEntityTable(table, "group");
}

/** True when any note table for this parent has GROUP + BANK/COMPANY columns. */
export function noteTablesHaveBankEntity(
  noteTablesByYear: Record<string, NoteExtractedTable[]> | undefined,
): { available: boolean; bankLabel: string } {
  if (!noteTablesByYear) return { available: false, bankLabel: "Bank" };
  for (const tables of Object.values(noteTablesByYear)) {
    for (const table of tables ?? []) {
      const split = splitGroupBankTable(table);
      if (split) return { available: true, bankLabel: split.bankLabel };
    }
  }
  return { available: false, bankLabel: "Bank" };
}

/**
 * Amount for one report year from extracted note tables, for Group or Bank.
 * Prefers a row matching `parentLabel`, otherwise the Total row.
 */
export function getNoteEntityAmountForYear(
  tables: NoteExtractedTable[] | undefined,
  year: string,
  entity: NoteEntityPanel,
  parentLabel?: string,
): number | null {
  if (!tables?.length) return null;

  for (const raw of tables) {
    const table = resolveNoteEntityTable(raw, entity);
    const yearCol = findNoteYearColumnIndex(table, year);
    const rows = table.rows || [];

    if (parentLabel) {
      const norm = normalizeNoteBreakdownLabel(parentLabel);
      for (const row of rows) {
        const label = String(row.cells?.[0] ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (!label) continue;
        if (normalizeNoteBreakdownLabel(label) === norm) {
          const amount = parseNoteAmount(row.cells?.[yearCol]);
          if (amount != null) return amount;
        }
      }
    }

    for (const row of rows) {
      const style =
        typeof row.style === "string" ? row.style.toLowerCase() : "";
      const label = String(row.cells?.[0] ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (style === "total" || /^totals?\b/i.test(label)) {
        const amount = parseNoteAmount(row.cells?.[yearCol]);
        if (amount != null) return amount;
      }
    }
  }
  return null;
}

/**
 * Parent-row amounts for the selected Group/Bank entity, taken from extracted
 * note captures (matching line label, else the Total row).
 */
export function getNoteEntityParentValues(
  noteTablesByYear: Record<string, NoteExtractedTable[]> | undefined,
  columnKeys: string[],
  entity: NoteEntityPanel,
  parentLabel: string,
): Record<string, number | null> | null {
  if (!noteTablesByYear) return null;
  const out: Record<string, number | null> = {};
  let any = false;
  for (const year of columnKeys) {
    const amount = getNoteEntityAmountForYear(
      noteTablesByYear[year],
      year,
      entity,
      parentLabel,
    );
    if (amount == null) continue;
    out[year] = amount;
    any = true;
  }
  return any ? out : null;
}

/** Find the column index for a report year in note headers (GROUP current year). */
export function findNoteYearColumnIndex(
  table: NoteExtractedTable,
  year: string,
): number {
  const yearRe = new RegExp(`\\b${year}\\b`);
  for (const row of table.header_rows || []) {
    for (let i = 0; i < row.length; i += 1) {
      if (yearRe.test(String(row[i] ?? ""))) return i;
    }
  }
  // Fallback: first amount column after label (+ optional note) — usually index 1 or 2.
  const width = Math.max(
    1,
    ...(table.header_rows || []).map((r) => r.length),
    ...(table.rows || []).map((r) => r.cells?.length ?? 0),
  );
  if (width >= 3) return 2;
  return Math.min(1, width - 1);
}

/**
 * Normalize note line labels so cross-year merges ignore footnotes / punctuation
 * (e.g. "...customers" vs "...customers (*)").
 */
export function normalizeNoteBreakdownLabel(label: string): string {
  return String(label || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-") // hyphen / en / em dashes
    .replace(/\s+/g, " ")
    .replace(/\s*\(\*+\)\s*$/g, "") // trailing (*) footnote
    .replace(/\s*\*+\s*$/g, "") // trailing *
    .replace(/\s*\[[0-9a-z]+\]\s*$/gi, "") // trailing [1]
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Prefer the cleaner printed label (without footnote markers) for display. */
function preferDisplayLabel(current: string, incoming: string): string {
  const cleanIncoming = incoming
    .replace(/\s+/g, " ")
    .replace(/\s*\(\*+\)\s*$/g, "")
    .replace(/\s*\*+\s*$/g, "")
    .trim();
  const cleanCurrent = current
    .replace(/\s+/g, " ")
    .replace(/\s*\(\*+\)\s*$/g, "")
    .replace(/\s*\*+\s*$/g, "")
    .trim();
  // Prefer version without footnote marker; otherwise keep shorter clean form.
  if (/\(\*+\)|\*$/.test(current) && !/\(\*+\)|\*$/.test(incoming)) {
    return cleanIncoming || incoming;
  }
  if (cleanIncoming.length > 0 && cleanIncoming.length < cleanCurrent.length) {
    return cleanIncoming;
  }
  return cleanCurrent || current;
}

/**
 * Build indented note-breakdown lines under a parent FS row.
 * Labels are shared across years; values follow Group or Bank/Company.
 * These lines are display-only (not FS keywords / not search catalog entries).
 *
 * Row order prefers the year with the most complete table; Total rows always
 * sort last. All capture segments for a year are merged in order.
 */
export function buildNoteBreakdownLines(
  noteTablesByYear: Record<string, NoteExtractedTable[]> | undefined,
  columnKeys: string[],
  entity: NoteEntityPanel = "group",
): NoteBreakdownLine[] {
  if (!noteTablesByYear) return [];

  type Acc = {
    label: string;
    style?: string;
    values: Record<string, number | null>;
    order: number;
  };
  const byNorm = new Map<string, Acc>();
  let orderCounter = 0;

  const rowCountForYear = (year: string): number => {
    let count = 0;
    for (const raw of noteTablesByYear[year] ?? []) {
      const table = resolveNoteEntityTable(raw, entity);
      for (const row of table.rows || []) {
        const style =
          typeof row.style === "string" ? row.style.toLowerCase() : "";
        if (style === "blank") continue;
        const label = String(row.cells?.[0] ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (label) count += 1;
      }
    }
    return count;
  };

  let bestYear = "";
  let bestCount = -1;
  for (const year of columnKeys) {
    const count = rowCountForYear(year);
    if (count > bestCount) {
      bestCount = count;
      bestYear = year;
    }
  }
  const orderedYears =
    bestYear && bestCount > 0
      ? [bestYear, ...columnKeys.filter((year) => year !== bestYear)]
      : columnKeys;

  const isTotalLike = (label: string, style?: string) => {
    if (style === "total") return true;
    return /^totals?\b/i.test(label.trim());
  };

  for (const year of orderedYears) {
    const tables = noteTablesByYear[year] ?? [];
    if (tables.length === 0) continue;

    for (const rawTable of tables) {
      const table = resolveNoteEntityTable(rawTable, entity);
      const yearCol = findNoteYearColumnIndex(table, year);

      for (const row of table.rows || []) {
        const styleRaw = row.style;
        const style =
          typeof styleRaw === "string" ? styleRaw.toLowerCase() : "";
        if (style === "blank") continue;
        const rawLabel = String(row.cells?.[0] ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (!rawLabel) continue;
        const norm = normalizeNoteBreakdownLabel(rawLabel);
        if (!norm) continue;
        let acc = byNorm.get(norm);
        if (!acc) {
          acc = {
            label: preferDisplayLabel(rawLabel, rawLabel),
            style: style || undefined,
            values: {},
            order: orderCounter++,
          };
          byNorm.set(norm, acc);
        } else {
          acc.label = preferDisplayLabel(acc.label, rawLabel);
          if (style && !acc.style) acc.style = style;
        }
        // Prefer first non-null value if a later segment/year already filled it.
        if (acc.values[year] == null) {
          acc.values[year] = parseNoteAmount(row.cells?.[yearCol]);
        }
      }
    }
  }

  return [...byNorm.values()]
    .sort((a, b) => {
      const aTot = isTotalLike(a.label, a.style);
      const bTot = isTotalLike(b.label, b.style);
      if (aTot !== bTot) return aTot ? 1 : -1;
      return a.order - b.order;
    })
    .map(({ label, style, values }) => ({ label, style, values }));
}

function isGroupLabel(value: string | undefined | null): boolean {
  return normalizeHeaderCell(value) === "GROUP";
}

function isBankLabel(value: string | undefined | null): boolean {
  const text = normalizeHeaderCell(value);
  return text === "BANK" || text === "COMPANY";
}

function bankDisplayLabel(value: string | undefined | null): string {
  const text = normalizeHeaderCell(value);
  if (text === "COMPANY") return "Company";
  return "Bank";
}

function projectCells(cells: string[], indices: number[]): string[] {
  return indices.map((index) => cells[index] ?? "");
}

function projectTable(
  table: NoteExtractedTable,
  indices: number[],
  entityCaption: string,
): NoteExtractedTable {
  return {
    ...table,
    caption: table.caption
      ? `${table.caption} · ${entityCaption}`
      : entityCaption,
    header_rows: (table.header_rows || []).map((row) =>
      projectCells(row, indices),
    ),
    rows: (table.rows || []).map((row) => ({
      ...row,
      cells: projectCells(row.cells || [], indices),
    })),
  };
}

/** Split a combined GROUP+BANK note table into two projected tables. */
export function splitGroupBankTable(
  table: NoteExtractedTable,
): SplitNoteTables | null {
  const headerRows = table.header_rows || [];
  if (headerRows.length === 0) return null;

  let groupIndex = -1;
  let bankIndex = -1;
  let bankRaw = "";

  for (const row of headerRows) {
    for (let i = 0; i < row.length; i += 1) {
      if (groupIndex < 0 && isGroupLabel(row[i])) groupIndex = i;
      if (bankIndex < 0 && isBankLabel(row[i])) {
        bankIndex = i;
        bankRaw = row[i] ?? "BANK";
      }
    }
    if (groupIndex >= 0 && bankIndex >= 0) break;
  }

  if (groupIndex < 0 || bankIndex < 0 || bankIndex <= groupIndex) {
    return null;
  }

  const width = Math.max(
    1,
    ...headerRows.map((row) => row.length),
    ...(table.rows || []).map((row) => row.cells?.length ?? 0),
  );

  const labelIndices = Array.from({ length: groupIndex }, (_, i) => i);
  const groupValueIndices = Array.from(
    { length: bankIndex - groupIndex },
    (_, i) => groupIndex + i,
  );
  const bankValueIndices = Array.from(
    { length: width - bankIndex },
    (_, i) => bankIndex + i,
  );

  if (groupValueIndices.length === 0 || bankValueIndices.length === 0) {
    return null;
  }

  const bankLabel = bankDisplayLabel(bankRaw);

  return {
    group: projectTable(
      table,
      [...labelIndices, ...groupValueIndices],
      "Group",
    ),
    bank: projectTable(
      table,
      [...labelIndices, ...bankValueIndices],
      bankLabel,
    ),
    bankLabel,
  };
}

function NoteTableGrid({
  table,
  fitContent = false,
}: {
  table: NoteExtractedTable;
  fitContent?: boolean;
}) {
  const columnCount = Math.max(
    1,
    ...table.header_rows.map((row) => row.length),
    ...table.rows.map((row) => row.cells.length),
  );

  const headerJoined = (table.header_rows || [])
    .map((row) => normalizeHeaderCell(row[1]))
    .join(" ");
  const hasNoteColumn = headerJoined.includes("NOTE");
  const cellPad = fitContent ? "px-2 py-1" : "px-2.5 py-1.5";
  const headerPad = fitContent ? "px-2 py-1.5" : "px-2.5 py-2";
  const labelMin = fitContent ? "min-w-[160px] max-w-[220px]" : "min-w-[200px] max-w-[280px]";
  const noteMin = fitContent ? "min-w-[3.5rem] max-w-[5.5rem]" : "min-w-[4.5rem] max-w-[7rem]";
  const valueMin = fitContent ? "min-w-[4.5rem]" : "min-w-[5.5rem]";

  return (
    <div
      className={cn(
        fitContent
          ? "w-max"
          : "w-full max-w-full overflow-x-auto overscroll-x-contain",
      )}
    >
      <table
        className={cn(
          "border-collapse text-xs tabular-nums",
          fitContent ? "w-max" : "w-max max-w-full",
        )}
      >
        {table.header_rows.length > 0 ? (
          <thead>
            {table.header_rows.map((row, rowIndex) => (
              <tr key={`header-${rowIndex}`}>
                {Array.from({ length: columnCount }, (_, cellIndex) => {
                  const cellText = row[cellIndex] ?? "";
                  const isLabel = cellIndex === 0;
                  const isNote = hasNoteColumn && cellIndex === 1;
                  return (
                    <th
                      key={cellIndex}
                      className={cn(
                        "border-b border-r border-border/60 font-semibold whitespace-pre-line last:border-r-0",
                        headerPad,
                        headerCellTone(cellText),
                        isLabel
                          ? cn(labelMin, "text-left")
                          : isNote
                            ? cn(noteMin, "text-left")
                            : cn(valueMin, "whitespace-nowrap text-right"),
                      )}
                    >
                      {cellText}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
        ) : null}
        <tbody>
          {table.rows.map((row, rowIndex) => {
            const styleClass = rowStyleClass(row.style);
            if (styleClass === "h-5" && fitContent) {
              return <tr key={`row-${rowIndex}`} className="h-2" />;
            }
            return (
              <tr
                key={`row-${rowIndex}`}
                className={cn(
                  "transition-colors hover:bg-amber-500/[0.06]",
                  !styleClass && "even:bg-muted/25",
                  styleClass === "h-5" ? "h-5" : styleClass,
                )}
              >
                {Array.from({ length: columnCount }, (_, cellIndex) => {
                  const isLabel = cellIndex === 0;
                  const isNote = hasNoteColumn && cellIndex === 1;
                  return (
                    <td
                      key={cellIndex}
                      className={cn(
                        "border-b border-r border-border/50 last:border-r-0",
                        cellPad,
                        isLabel
                          ? cn(
                              labelMin,
                              "text-left font-sans whitespace-pre-line text-foreground/95",
                            )
                          : isNote
                            ? cn(
                                noteMin,
                                "text-left font-sans whitespace-pre-line text-muted-foreground",
                              )
                            : cn(
                                valueMin,
                                "text-right font-mono whitespace-nowrap text-foreground/90",
                              ),
                    )}
                    >
                      {row.cells[cellIndex] ?? ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupBankSwipeTable({
  caption,
  split,
  className,
  yearLabel,
  fitContent = false,
}: {
  caption: string;
  split: SplitNoteTables;
  className?: string;
  yearLabel?: string;
  fitContent?: boolean;
}) {
  const [panel, setPanel] = React.useState<EntityPanel>("group");
  const trackRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    moved: boolean;
  } | null>(null);

  const showBank = panel === "bank";

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - state.startX) > 28) {
      state.moved = true;
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!state.moved) return;
    const dx = event.clientX - state.startX;
    if (dx <= -48) setPanel("bank");
    else if (dx >= 48) setPanel("group");
  };

  return (
    <section
      data-no-pan
      data-note-table-card
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm ring-1 ring-amber-500/10",
        fitContent ? "w-max" : "w-max max-w-full",
        className,
      )}
    >
      <div className="flex shrink-0 flex-nowrap items-center justify-between gap-2 border-b border-amber-500/15 bg-gradient-to-r from-amber-500/10 via-muted/40 to-muted/20 px-2.5 py-1.5">
        <h4 className="min-w-0 truncate text-xs font-semibold tracking-tight sm:text-sm">
          {caption}
        </h4>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="inline-flex rounded-md border border-border/80 bg-background/80 p-0.5 text-xs shadow-sm"
            role="tablist"
            aria-label="Group or Bank table"
          >
            <button
              type="button"
              role="tab"
              aria-selected={panel === "group"}
              onClick={() => setPanel("group")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                panel === "group"
                  ? "bg-teal-700 text-teal-50 shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Group
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === "bank"}
              onClick={() => setPanel("bank")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                panel === "bank"
                  ? "bg-teal-700 text-teal-50 shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {split.bankLabel}
            </button>
          </div>
          {yearLabel ? <YearBadge year={yearLabel} /> : null}
        </div>
      </div>

      <div
        ref={trackRef}
        className="touch-pan-y bg-background/40"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <NoteTableGrid
          table={showBank ? split.bank : split.group}
          fitContent={fitContent}
        />
      </div>

      <div className="flex shrink-0 items-center justify-start gap-1.5 border-t border-border/60 bg-muted/20 px-2.5 py-1">
        <span
          className={cn(
            "size-1.5 rounded-full transition-colors",
            panel === "group" ? "bg-teal-500" : "bg-muted-foreground/35",
          )}
        />
        <span
          className={cn(
            "size-1.5 rounded-full transition-colors",
            panel === "bank" ? "bg-teal-500" : "bg-muted-foreground/35",
          )}
        />
        <span className="ml-1 text-[10px] text-muted-foreground">
          Swipe or tap to switch · showing{" "}
          {panel === "group" ? "Group" : split.bankLabel}
        </span>
      </div>
    </section>
  );
}

function SingleNoteTable({
  table,
  tableIndex,
  className,
  yearLabel,
  fitContent = false,
}: {
  table: NoteExtractedTable;
  tableIndex: number;
  className?: string;
  yearLabel?: string;
  fitContent?: boolean;
}) {
  return (
    <section
      data-no-pan
      data-note-table-card
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm ring-1 ring-amber-500/10",
        fitContent ? "w-max" : "w-max max-w-full",
        className,
      )}
    >
      <div className="flex shrink-0 flex-nowrap items-center justify-between gap-2 border-b border-amber-500/15 bg-gradient-to-r from-amber-500/10 via-muted/40 to-muted/20 px-2.5 py-1.5">
        <h4 className="min-w-0 truncate text-xs font-semibold tracking-tight sm:text-sm">
          {table.caption || `Note table ${tableIndex + 1}`}
        </h4>
        {yearLabel ? <YearBadge year={yearLabel} /> : null}
      </div>
      <div className="bg-background/40">
        <NoteTableGrid table={table} fitContent={fitContent} />
      </div>
    </section>
  );
}

export function ExtractedNoteTables({
  tables,
  className,
  yearLabel,
  fitContent = false,
}: ExtractedNoteTablesProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        fitContent ? "w-max" : "w-max max-w-full",
        className,
      )}
    >
      {tables.map((table, tableIndex) => {
        const split = splitGroupBankTable(table);
        const caption = table.caption || `Note table ${tableIndex + 1}`;

        if (split) {
          return (
            <GroupBankSwipeTable
              key={`${caption}-split-${tableIndex}`}
              caption={caption}
              split={split}
              yearLabel={yearLabel}
              fitContent={fitContent}
            />
          );
        }

        return (
          <SingleNoteTable
            key={`${caption}-${tableIndex}`}
            table={table}
            tableIndex={tableIndex}
            yearLabel={yearLabel}
            fitContent={fitContent}
          />
        );
      })}
    </div>
  );
}
