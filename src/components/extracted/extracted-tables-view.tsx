"use client";

import * as React from "react";
import {
  AlertCircle,
  Download,
  FileSpreadsheet,
  FileText,
  FileWarning,
  TableProperties,
  Upload,
} from "lucide-react";

import { StatementTypePills } from "@/components/ai/statement-type-pills";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  downloadExtractedTablesXlsx,
  getCellChange,
  readUploadedTablesFromBuffer,
  type CellChange,
  type CellChangeMap,
  type UploadedTables,
} from "@/lib/extracted-tables-excel";
import {
  downloadExtractedTablesCsv,
  downloadExtractedTablesPdf,
  type ExtractedExportMeta,
} from "@/lib/extracted-tables-export";
import { cn } from "@/lib/utils";
import {
  STMT_ORDER,
  statementLabel,
} from "@/lib/statement-types";

export type { ExtractedExportMeta };

export type ExtractedRow = {
  cells: string[];
  style?: "data" | "section" | "subtotal" | "total" | "blank" | string;
};

export type ExtractedTable = {
  caption?: string | null;
  header_rows?: string[][];
  rows: ExtractedRow[];
};

export type ExtractedStatementData = {
  statement_title?: string | null;
  preamble?: string | null;
  footnotes?: string | null;
  tables: ExtractedTable[];
};

export type ExtractedStatement = {
  key: string;
  title?: string | null;
  status?: string;
  error?: string | null;
  data?: ExtractedStatementData | null;
};

const NUMBER_RE = /^\s*\(?\s*-?[\d.,]+\s*%?\)?\s*$/;
const NEG_RE = /^\s*\(.*\)\s*$/;
const CHANGED_CELL_CLASS =
  "cursor-help bg-green-500/70 text-green-950 ring-1 ring-inset ring-green-700 dark:bg-green-500/55 dark:text-green-50 dark:ring-green-300";

function changeTitle(change: CellChange | null) {
  if (!change) return undefined;
  const from = change.from.trim() ? change.from : "empty";
  return `Changed from ${from}`;
}

function isNumberCell(value: string) {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "-" || trimmed === "—" || trimmed === "–") return true;
  return NUMBER_RE.test(trimmed);
}

function cellYear(value: string): number | null {
  const match = String(value ?? "")
    .trim()
    .match(/\b(20\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  const max = new Date().getFullYear() + 1;
  if (year < 1990 || year > max) return null;
  return year;
}

/**
 * Keep label/note prefix columns plus amount columns for `reportYear` only
 * (drops comparative prior-year Group/Company columns).
 */
export function filterExtractedTableToYear(
  table: ExtractedTable,
  reportYear: number,
): ExtractedTable {
  const headerRows = (table.header_rows ?? []).map((row) =>
    row.map((cell) => String(cell ?? "")),
  );
  const rows = table.rows ?? [];
  if (headerRows.length === 0) return table;

  const colCount = Math.max(
    ...headerRows.map((r) => r.length),
    ...rows.map((r) => r.cells?.length ?? 0),
    1,
  );

  const years: (number | null)[] = Array.from({ length: colCount }, (_, ci) => {
    for (const row of headerRows) {
      const year = cellYear(row[ci] ?? "");
      if (year != null) return year;
    }
    return null;
  });

  const firstYearCol = years.findIndex((y) => y != null);
  if (firstYearCol === -1) return table;

  const keep = years.map((year, ci) => {
    if (ci < firstYearCol) return true;
    return year === reportYear;
  });

  if (keep.every(Boolean)) return table;

  const filterCells = (cells: string[]) =>
    Array.from({ length: colCount }, (_, ci) => cells[ci] ?? "").filter(
      (_, ci) => keep[ci],
    );

  return {
    ...table,
    header_rows: headerRows.map(filterCells),
    rows: rows.map((row) => ({
      ...row,
      cells: filterCells((row.cells ?? []).map((c) => String(c ?? ""))),
    })),
  };
}

export function filterStatementToYear(
  statement: ExtractedStatement,
  reportYear: number,
): ExtractedStatement {
  if (!statement.data?.tables?.length) return statement;
  return {
    ...statement,
    data: {
      ...statement.data,
      tables: statement.data.tables.map((table) =>
        filterExtractedTableToYear(table, reportYear),
      ),
    },
  };
}

export function statementsFromResults(
  results: Record<string, unknown> | null | undefined,
): ExtractedStatement[] {
  if (!results || typeof results !== "object") return [];

  // Notes belong on the DB page only — Extracted Tables is main FS.
  const keys = Object.keys(results).filter((k) => !/^note_/i.test(k));
  keys.sort((a, b) => {
    const ai = STMT_ORDER.indexOf(a);
    const bi = STMT_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return keys.map((key) => {
    const value = (results as Record<string, unknown>)[key] as
      | Record<string, unknown>
      | null
      | undefined;
    const status =
      typeof value?.status === "string" ? (value.status as string) : "unknown";
    const title =
      typeof value?.title === "string" ? (value.title as string) : null;
    const data =
      value && typeof value.data === "object"
        ? (value.data as ExtractedStatementData)
        : null;
    const error =
      typeof value?.error === "string" ? (value.error as string) : null;

    return { key, title, status, error, data };
  });
}

export function StatementBlock({
  statement,
  compact = false,
  changeMap = null,
}: {
  statement: ExtractedStatement;
  compact?: boolean;
  changeMap?: CellChangeMap | null;
}) {
  const label = statementLabel(statement.key, statement.title);
  const data = statement.data;
  const preambleChange = getCellChange(
    changeMap,
    statement.key,
    -1,
    "preamble",
    0,
    0,
  );
  const footnotesChange = getCellChange(
    changeMap,
    statement.key,
    -1,
    "footnotes",
    0,
    0,
  );
  const titleChange = getCellChange(changeMap, statement.key, -1, "title", 0, 0);

  return (
    <section className="flex min-w-0 flex-col rounded-xl border bg-card text-card-foreground shadow-sm">
      {!compact ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <TableProperties className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="font-heading text-sm font-semibold tracking-tight">
              {label}
            </h3>
            {data?.statement_title ? (
              <span
                className={cn(
                  "hidden text-xs text-muted-foreground sm:inline",
                  titleChange &&
                    "rounded bg-green-400/70 px-1 text-green-950 dark:bg-green-500/50 dark:text-green-50",
                )}
                title={changeTitle(titleChange) ?? data.statement_title}
              >
                · {data.statement_title}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            {data?.tables?.length ? (
              <Badge variant="secondary" className="text-[10px]">
                {data.tables.length} table{data.tables.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
            <Badge
              variant={statement.status === "ok" ? "default" : "secondary"}
              className={cn(
                "text-[10px]",
                statement.status !== "ok" &&
                  "border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300",
              )}
            >
              {statement.status ?? "unknown"}
            </Badge>
          </div>
        </header>
      ) : null}

      <div className="flex min-w-0 flex-col px-4 py-3">
        {statement.status === "error" || statement.error ? (
          <div className="flex shrink-0 items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <div>
              <div className="font-medium">Extraction error</div>
              <div className="opacity-80">{statement.error}</div>
            </div>
          </div>
        ) : !data ? (
          <div className="flex shrink-0 items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            <FileWarning className="size-3.5" />
            No structured data for this statement.
          </div>
        ) : (
          <>
            {data.preamble ? (
              <p
                className={cn(
                  "mb-3 shrink-0 text-xs italic text-muted-foreground",
                  preambleChange &&
                    "rounded bg-green-400/70 px-1.5 py-1 text-green-950 not-italic dark:bg-green-500/50 dark:text-green-50",
                )}
                title={changeTitle(preambleChange)}
              >
                {data.preamble}
              </p>
            ) : null}

            {(data.tables ?? []).length === 0 ? (
              <div className="shrink-0 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                No tables in this statement.
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-3">
                {(data.tables ?? []).map((table, idx) => (
                  <FinancialTable
                    key={idx}
                    table={table}
                    tableIndex={idx}
                    statementKey={statement.key}
                    changeMap={changeMap}
                  />
                ))}

                {data.footnotes ? (
                  <div
                    className={cn(
                      "rounded-md bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-line",
                      footnotesChange &&
                        "bg-green-400/70 text-green-950 dark:bg-green-500/50 dark:text-green-50",
                    )}
                    title={changeTitle(footnotesChange)}
                  >
                    {data.footnotes}
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export function FinancialTable({
  table,
  tableIndex = 0,
  statementKey = "",
  changeMap = null,
}: {
  table: ExtractedTable;
  tableIndex?: number;
  statementKey?: string;
  changeMap?: CellChangeMap | null;
}) {
  const headerRows = table.header_rows ?? [];
  const rows = table.rows ?? [];
  const colCount = Math.max(
    ...headerRows.map((r) => r.length),
    ...rows.map((r) => r.cells?.length ?? 0),
    1,
  );
  const dataRowCount = rows.filter((r) => (r.style ?? "data") !== "blank").length;
  const captionChange = getCellChange(
    changeMap,
    statementKey,
    tableIndex,
    "caption",
    0,
    0,
  );

  return (
    <div className="min-w-0 overflow-hidden rounded-md border">
      {table.caption || dataRowCount > 0 ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5",
            captionChange && "bg-green-400/70 dark:bg-green-500/50",
          )}
          title={changeTitle(captionChange)}
        >
          <div
            className={cn(
              "min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-foreground/80",
              captionChange && "text-green-950 dark:text-green-50",
            )}
          >
            {table.caption ?? ""}
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {dataRowCount} row{dataRowCount === 1 ? "" : "s"}
          </Badge>
        </div>
      ) : null}
      <div
        className={cn(
          "w-full overflow-x-auto",
          "[scrollbar-width:thin] [scrollbar-color:var(--border)_transparent]",
          "[&::-webkit-scrollbar]:h-2",
          "[&::-webkit-scrollbar-track]:bg-transparent",
          "[&::-webkit-scrollbar-thumb]:rounded-full",
          "[&::-webkit-scrollbar-thumb]:bg-border",
        )}
      >
        <table className="w-full min-w-max border-collapse text-xs tabular-nums">
          {headerRows.length > 0 ? (
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground shadow-[0_1px_0_0_var(--border)]">
              {headerRows.map((row, ri) => (
                <tr key={`h-${ri}`}>
                  {Array.from({ length: colCount }).map((_, ci) => {
                    const value = row[ci] ?? "";
                    const change = getCellChange(
                      changeMap,
                      statementKey,
                      tableIndex,
                      "h",
                      ri,
                      ci,
                    );
                    return (
                      <th
                        key={ci}
                        className={cn(
                          "border-b px-2.5 py-1.5 font-semibold align-bottom",
                          ci === 0
                            ? "text-left"
                            : "text-right whitespace-nowrap",
                          change && CHANGED_CELL_CLASS,
                        )}
                        title={changeTitle(change)}
                        data-changed={change ? "true" : undefined}
                      >
                        {value}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
          ) : null}
          <tbody>
            {rows.map((row, ri) => {
              const style = row.style ?? "data";
              const cells = row.cells ?? [];
              const isBlank = style === "blank";
              const isSection = style === "section";
              const isSubtotal = style === "subtotal";
              const isTotal = style === "total";
              const isHighlight = style === "highlight";
              const isHighlightSection = style === "highlight-section";

              if (isBlank) {
                return (
                  <tr key={`r-${ri}`}>
                    <td
                      colSpan={colCount}
                      className="border-b border-transparent px-2 py-1"
                      aria-hidden="true"
                    />
                  </tr>
                );
              }

              return (
                <tr
                  key={`r-${ri}`}
                  className={cn(
                    "border-b last:border-b-0 transition-colors",
                    isSection &&
                      !isHighlightSection &&
                      "bg-muted/40 font-semibold uppercase tracking-wide text-foreground",
                    isHighlightSection &&
                      "bg-amber-500/20 font-semibold tracking-wide text-amber-950 dark:bg-amber-400/20 dark:text-amber-50",
                    isHighlight &&
                      "bg-amber-500/10 text-foreground dark:bg-amber-400/15",
                    isSubtotal &&
                      !isHighlight &&
                      "bg-muted/20 font-medium text-foreground",
                    isTotal &&
                      !isHighlight &&
                      "bg-primary/5 font-bold text-foreground border-y border-primary/30",
                    !isSection &&
                      !isSubtotal &&
                      !isTotal &&
                      !isHighlight &&
                      !isHighlightSection &&
                      "hover:bg-muted/30",
                  )}
                >
                  {Array.from({ length: colCount }).map((_, ci) => {
                    const value = cells[ci] ?? "";
                    const isFirst = ci === 0;
                    const numeric = !isFirst && isNumberCell(value);
                    const isNegative = numeric && NEG_RE.test(value.trim());
                    const change = getCellChange(
                      changeMap,
                      statementKey,
                      tableIndex,
                      "r",
                      ri,
                      ci,
                    );

                    return (
                      <td
                        key={ci}
                        className={cn(
                          "px-2.5 py-1.5 align-top",
                          isFirst
                            ? "text-left"
                            : "text-right whitespace-nowrap",
                          isNegative &&
                            "text-rose-600 dark:text-rose-300",
                          (isSection || isHighlightSection) &&
                            isFirst &&
                            "text-[11px]",
                          change && CHANGED_CELL_CLASS,
                        )}
                        title={changeTitle(change)}
                        data-changed={change ? "true" : undefined}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ExtractedTablesView({
  statements,
  loading,
  error,
  emptyMessage,
  stickyTopClassName = "top-[6.25rem]",
  pillsSticky = true,
  exportMeta,
}: {
  statements: ExtractedStatement[];
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  /** Tailwind `top-*` class for the sticky statement-pill bar (page mode). */
  stickyTopClassName?: string;
  /** When false the pill bar scrolls with content instead of sticking — use
   *  inside a self-scrolling container where the table header is sticky too,
   *  so the two sticky bars don't overlap. */
  pillsSticky?: boolean;
  /** Company / period labels used in downloaded PDF / Excel filenames. */
  exportMeta?: ExtractedExportMeta | null;
}) {
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [upload, setUpload] = React.useState<UploadedTables | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const exportCompany = exportMeta?.companyName ?? "";
  const exportYear = exportMeta?.year ?? null;
  const exportPeriod = exportMeta?.period ?? null;
  const exportQuarter = exportMeta?.quarter ?? null;

  const sourceSignature = React.useMemo(() => {
    const body = statements
      .map((statement) => {
        const tables = statement.data?.tables ?? [];
        const cells = tables
          .map((table) =>
            (table.rows ?? [])
              .map((row) => (row.cells ?? []).join("\u0001"))
              .join("\u0002"),
          )
          .join("\u0003");
        return `${statement.key}\u0004${cells}`;
      })
      .join("\u0005");
    return [exportCompany, exportYear, exportPeriod, exportQuarter, body].join(
      "\u0006",
    );
  }, [statements, exportCompany, exportYear, exportPeriod, exportQuarter]);

  const [seenSignature, setSeenSignature] = React.useState(sourceSignature);
  if (seenSignature !== sourceSignature) {
    setSeenSignature(sourceSignature);
    setUpload(null);
    setUploadError(null);
  }

  const viewStatements = upload?.statements ?? statements;

  React.useEffect(() => {
    if (!viewStatements || viewStatements.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !viewStatements.some((s) => s.key === selectedKey)) {
      setSelectedKey(viewStatements[0].key);
    }
  }, [viewStatements, selectedKey]);

  const canDownload = React.useMemo(
    () =>
      viewStatements.some(
        (s) => s.status !== "error" && (s.data?.tables?.length ?? 0) > 0,
      ),
    [viewStatements],
  );

  const resolvedMeta: ExtractedExportMeta = React.useMemo(
    () => ({
      companyName: exportCompany.trim() || "extracted",
      year: exportYear,
      period: exportPeriod,
      quarter: exportQuarter,
    }),
    [exportCompany, exportYear, exportPeriod, exportQuarter],
  );

  const changeCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of Object.keys(upload?.changes ?? {})) {
      const statementKey = key.split("\t")[0] ?? "";
      if (!statementKey) continue;
      counts[statementKey] = (counts[statementKey] ?? 0) + 1;
    }
    return counts;
  }, [upload]);

  const sourceSignatureRef = React.useRef(sourceSignature);
  sourceSignatureRef.current = sourceSignature;

  const handleUpload = React.useCallback(
    async (file: File) => {
      const signature = sourceSignatureRef.current;
      setUploading(true);
      setUploadError(null);
      try {
        const buffer = await file.arrayBuffer();
        const result = await readUploadedTablesFromBuffer(
          buffer,
          file.name,
          statements,
        );
        if (sourceSignatureRef.current !== signature) return;
        setUpload(result);
      } catch (err) {
        setUploadError(
          err instanceof Error ? err.message : "Could not read that Excel file.",
        );
      } finally {
        setUploading(false);
      }
    },
    [statements],
  );

  const changeCount = Object.keys(upload?.changes ?? {}).length;

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Loading extracted tables…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-10 text-center">
        <div className="max-w-sm">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <h3 className="mt-3 font-heading text-base font-medium">
            Could not load extracted data
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!viewStatements || viewStatements.length === 0) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-10 text-center">
        <div className="max-w-sm">
          <TableProperties className="mx-auto size-8 text-muted-foreground" />
          <h3 className="mt-3 font-heading text-base font-medium">
            No tables to show
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {emptyMessage ??
              "The selected report does not have extracted JSON yet."}
          </p>
        </div>
      </div>
    );
  }

  const selected =
    viewStatements.find((s) => s.key === selectedKey) ?? viewStatements[0];

  return (
    <div className="flex min-w-0 flex-col gap-2 p-3">
      <div
        className={cn(
          "z-20 -mx-3 w-[calc(100%+1.5rem)] min-w-0 border-b bg-card px-3 pb-2",
          pillsSticky &&
            "sticky bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80",
          pillsSticky && stickyTopClassName,
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <StatementTypePills
              items={viewStatements.map((statement) => ({
                key: statement.key,
                title: statement.title,
                tableCount: statement.data?.tables?.length ?? 0,
                hasError:
                  statement.status === "error" || Boolean(statement.error),
                changedCount: changeCounts[statement.key] ?? 0,
              }))}
              selectedKey={selected.key}
              onSelect={setSelectedKey}
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="hidden"
            aria-label="Upload edited Excel"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleUpload(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5"
            disabled={!canDownload || uploading}
            aria-label="Upload edited Excel"
            title="Upload an edited Excel file from Download → Excel"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            <span className="hidden sm:inline">
              {uploading ? "Reading…" : "Upload"}
            </span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5"
                  disabled={!canDownload}
                  aria-label="Download data"
                  title="Download data"
                />
              }
            >
              <Download className="size-3.5" />
              <span className="hidden sm:inline">Download</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  disabled={!canDownload}
                  onClick={() => {
                    void downloadExtractedTablesXlsx(
                      viewStatements,
                      resolvedMeta,
                    ).catch((err) => {
                      setUploadError(
                        err instanceof Error
                          ? err.message
                          : "Could not download Excel.",
                      );
                    });
                  }}
                >
                  <FileSpreadsheet className="size-4" />
                  Excel
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canDownload}
                  onClick={() =>
                    downloadExtractedTablesPdf(viewStatements, resolvedMeta)
                  }
                >
                  <FileText className="size-4" />
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canDownload}
                  onClick={() =>
                    downloadExtractedTablesCsv(viewStatements, resolvedMeta)
                  }
                >
                  <FileSpreadsheet className="size-4" />
                  CSV
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {upload ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-green-600/40 bg-green-500/15 px-3 py-1.5 text-xs text-green-950 dark:text-green-50">
            <span>
              {changeCount === 0
                ? "Uploaded file matches the extracted tables. No cells changed."
                : `Showing the uploaded spreadsheet. ${changeCount} cell${changeCount === 1 ? "" : "s"} changed — highlighted in green.`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 shrink-0 px-2 text-xs"
              onClick={() => {
                setUpload(null);
                setUploadError(null);
              }}
            >
              Reset
            </Button>
          </div>
        ) : null}
        {uploadError ? (
          <p className="mt-2 text-xs text-destructive">{uploadError}</p>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col">
        <StatementBlock
          statement={selected}
          compact
          changeMap={upload?.changes ?? null}
        />
      </div>
    </div>
  );
}
