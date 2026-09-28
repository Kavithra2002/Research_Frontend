"use client";

import * as React from "react";
import { Loader2, TableProperties } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { mergePrintedStatements } from "@/lib/printed-multi-year";
import { cn } from "@/lib/utils";

export type PrintedRow = {
  cells: string[];
  note_ref?: string | null;
  style?: string;
};

export type PrintedTable = {
  key?: string;
  title?: string;
  unit?: string;
  pages?: number[];
  header_rows?: string[][];
  rows?: PrintedRow[];
  note_column?: number | null;
  year_breaks?: number[];
  ok?: boolean;
  note_ref?: string;
};

export type PrintedPack = {
  company_slug: string;
  company_name?: string;
  year: number;
  unit?: string;
  available_years?: number[];
  statements?: PrintedTable[];
  notes?: Record<string, PrintedTable>;
  error?: string;
};

const AMOUNT_RE =
  /^\s*(?:[–—\-]|[\(\-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?\)?|[\(\-]?\d+\.\d+%?\)?)\s*$/;

function isAmount(value: string): boolean {
  return AMOUNT_RE.test(value.trim());
}

function headerSpans(row: string[]): { text: string; span: number }[] {
  const spans: { text: string; span: number }[] = [];
  let index = 0;
  while (index < row.length) {
    const text = (row[index] ?? "").trim();
    if (!text) {
      spans.push({ text: "", span: 1 });
      index += 1;
      continue;
    }
    let span = 1;
    while (index + span < row.length && !(row[index + span] ?? "").trim()) {
      span += 1;
    }
    spans.push({ text, span });
    index += span;
  }
  return spans;
}

function NoteButton({
  noteRef,
  onOpen,
}: {
  noteRef: string;
  onOpen: (noteRef: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(noteRef)}
      className="mx-auto inline-flex min-w-8 items-center justify-center rounded bg-amber-400/35 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber-950 hover:bg-amber-400/60 dark:text-amber-50"
      title={`Open note ${noteRef}`}
    >
      {noteRef}
    </button>
  );
}

function StatementGrid({
  table,
  onOpenNote,
}: {
  table: PrintedTable;
  onOpenNote: (noteRef: string) => void;
}) {
  const headerRows = table.header_rows ?? [];
  const rows = table.rows ?? [];
  const noteColumn = table.note_column ?? null;
  const yearBreaks = new Set(table.year_breaks ?? []);
  const notes = new Set(
    rows.map((row) => row.note_ref).filter((ref): ref is string => Boolean(ref)),
  );
  const colCount = Math.max(
    1,
    ...headerRows.map((row) => row.length),
    ...rows.map((row) => row.cells?.length ?? 0),
  );

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead className="sticky top-0 z-20 bg-muted">
          {headerRows.map((row, rowIndex) => {
            let column = 0;
            return (
            <tr key={`h-${rowIndex}`}>
              {headerSpans(row).map((cell, cellIndex) => {
                const start = column;
                column += cell.span;
                return (
                <th
                  key={`${rowIndex}-${cellIndex}`}
                  colSpan={cell.span}
                  className={cn(
                    "border-b px-2 py-1.5 text-center text-[11px] font-semibold text-muted-foreground",
                    yearBreaks.has(start) && "border-l-2 border-l-foreground/35",
                    start === noteColumn && "w-16 min-w-16",
                    cellIndex === 0 &&
                      "sticky left-0 z-30 bg-muted text-left",
                  )}
                >
                  {cell.text}
                </th>
                );
              })}
            </tr>
            );
          })}
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const style = (row.style ?? "data").toLowerCase();
            const section = style === "section";
            const total = style === "total";
            const cells = row.cells ?? [];
            return (
              <tr
                key={`${cells[0] ?? "row"}-${rowIndex}`}
                className={cn(
                  section && "bg-sky-950/90 text-sky-100",
                  total && "bg-muted/60 font-semibold",
                  !section && !total && rowIndex % 2 === 1 && "bg-muted/30",
                )}
              >
                {Array.from({ length: colCount }, (_, cellIndex) => {
                  const value = cells[cellIndex] ?? "";
                  const noteHere =
                    noteColumn === cellIndex &&
                    value &&
                    (notes.has(value) || row.note_ref === value);
                  return (
                    <td
                      key={cellIndex}
                      className={cn(
                        "border-b px-2 py-1 align-middle whitespace-nowrap",
                        yearBreaks.has(cellIndex) && "border-l-2 border-l-foreground/35",
                        cellIndex === noteColumn
                          ? "w-16 min-w-16 px-1 text-center"
                          : cellIndex === 0
                            ? "sticky left-0 z-10 min-w-56 max-w-md bg-inherit text-left"
                            : isAmount(value)
                              ? "text-right font-mono text-[0.78rem]"
                              : "text-center text-xs",
                        section && cellIndex === 0 && "bg-sky-950 text-sky-100",
                        !section &&
                          cellIndex === 0 &&
                          (rowIndex % 2 === 1 ? "bg-muted" : "bg-card"),
                        total && cellIndex === 0 && "bg-muted",
                      )}
                    >
                      {noteHere ? (
                        <NoteButton noteRef={value} onOpen={onOpenNote} />
                      ) : (
                        value
                      )}
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

export function PrintedStatementPanel({
  company,
  statementKey,
  refreshToken = 0,
  enabled = true,
  fromYear = null,
  toYear = null,
  entity = "group",
  onAvailableYears,
  onEntities,
  children,
}: {
  company: string | null;
  statementKey: string | null;
  refreshToken?: number;
  enabled?: boolean;
  fromYear?: number | null;
  toYear?: number | null;
  entity?: "group" | "company";
  onAvailableYears?: (years: number[]) => void;
  onEntities?: (entities: string[]) => void;
  children?: React.ReactNode;
}) {
  const [reports, setReports] = React.useState<PrintedPack[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [missing, setMissing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [openNote, setOpenNote] = React.useState<string | null>(null);
  const onYearsRef = React.useRef(onAvailableYears);
  onYearsRef.current = onAvailableYears;
  const onEntitiesRef = React.useRef(onEntities);
  onEntitiesRef.current = onEntities;

  React.useEffect(() => {
    if (!enabled || !company || !statementKey) {
      setReports([]);
      setMissing(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMissing(false);
    const qs = new URLSearchParams({ company, year: "all" });
    fetch(`/api/db/printed-statements?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as PrintedPack & {
          reports?: PrintedPack[];
          available_years?: number[];
        };
        if (!res.ok) {
          if (res.status === 404) {
            if (!cancelled) setMissing(true);
            return;
          }
          throw new Error(json.error ?? `Failed (${res.status})`);
        }
        if (!cancelled) {
          const next = json.reports?.length ? json.reports : [json];
          setReports(next);
          onYearsRef.current?.(
            json.available_years ?? next.map((report) => report.year),
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setReports([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company, enabled, refreshToken, statementKey]);

  const merged = React.useMemo(
    () =>
      statementKey
        ? mergePrintedStatements(reports, statementKey, fromYear, toYear, entity)
        : null,
    [entity, fromYear, reports, statementKey, toYear],
  );

  const entityKey = (merged?.entities ?? []).join("|");
  React.useEffect(() => {
    onEntitiesRef.current?.(entityKey ? entityKey.split("|") : []);
  }, [entityKey]);

  if (!enabled || !statementKey) {
    return <>{children}</>;
  }

  const statement = merged?.table;
  const ready = Boolean(statement && (statement.rows?.length ?? 0) > 0);

  if (loading && reports.length === 0) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading statement…
      </div>
    );
  }

  if (!ready) {
    return (
      <>
        {children ?? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 p-8 text-center">
            <p className="text-sm font-medium">No statements extracted yet</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Tick an annual report under Development, then click Run DB Annual.
              The income statement, comprehensive income, balance sheet, cash
              flow, and their notes are saved for the years you select.
            </p>
          </div>
        )}
      </>
    );
  }

  const unit = statement?.unit || merged?.unit || "";
  const note = openNote ? merged?.notes?.[openNote] : null;
  const yearLabel =
    merged && merged.years.length > 1
      ? merged.years.join(", ")
      : `Annual Report ${merged?.years[0] ?? ""}`;

  return (
    <>
      <section className="flex min-w-0 flex-col rounded-xl border bg-card shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <TableProperties className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h3 className="font-heading text-sm font-semibold">
                {statement?.title}
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                {merged?.companyName} · {yearLabel}
                {unit ? ` · ${unit}` : ""}
                {" · "}
                Note numbers open the extracted note table
              </p>
            </div>
          </div>
        </header>
        {error ? (
          <p className="px-4 py-2 text-xs text-destructive">{error}</p>
        ) : null}
        {missing ? null : (
          <StatementGrid table={statement!} onOpenNote={setOpenNote} />
        )}
      </section>

      <Dialog open={openNote != null} onOpenChange={(open) => !open && setOpenNote(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {note?.title
                ? `Note ${openNote} — ${note.title}`
                : `Note ${openNote ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {note?.pages?.length
                ? `Extracted from PDF page ${note.pages.join(", ")}`
                : "Extracted note table"}
              {note?.unit ? ` · ${note.unit}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-auto rounded-md border">
            {note && (note.rows?.length ?? 0) > 0 ? (
              <StatementGrid table={note} onOpenNote={setOpenNote} />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                No note table was extracted for note {openNote}.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
