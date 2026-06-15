"use client";

import * as React from "react";
import { AlertCircle, FileWarning, TableProperties } from "lucide-react";

import { StatementTypePills } from "@/components/ai/statement-type-pills";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  STMT_ORDER,
  statementLabel,
} from "@/lib/statement-types";

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

function isNumberCell(value: string) {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "-" || trimmed === "—" || trimmed === "–") return true;
  return NUMBER_RE.test(trimmed);
}

export function statementsFromResults(
  results: Record<string, unknown> | null | undefined,
): ExtractedStatement[] {
  if (!results || typeof results !== "object") return [];

  const keys = Object.keys(results);
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
}: {
  statement: ExtractedStatement;
  compact?: boolean;
}) {
  const label = statementLabel(statement.key, statement.title);
  const data = statement.data;

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
                className="hidden text-xs text-muted-foreground sm:inline"
                title={data.statement_title}
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
              <p className="mb-3 shrink-0 text-xs italic text-muted-foreground">
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
                  <FinancialTable key={idx} table={table} />
                ))}

                {data.footnotes ? (
                  <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground whitespace-pre-line">
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

function FinancialTable({ table }: { table: ExtractedTable }) {
  const headerRows = table.header_rows ?? [];
  const rows = table.rows ?? [];
  const colCount = Math.max(
    ...headerRows.map((r) => r.length),
    ...rows.map((r) => r.cells?.length ?? 0),
    1,
  );
  const dataRowCount = rows.filter((r) => (r.style ?? "data") !== "blank").length;

  return (
    <div className="min-w-0 overflow-hidden rounded-md border">
      {table.caption || dataRowCount > 0 ? (
        <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
          <div className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
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
                    return (
                      <th
                        key={ci}
                        className={cn(
                          "border-b px-2.5 py-1.5 font-semibold align-bottom",
                          ci === 0
                            ? "text-left"
                            : "text-right whitespace-nowrap",
                        )}
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
                      "bg-muted/40 font-semibold uppercase tracking-wide text-foreground",
                    isSubtotal &&
                      "bg-muted/20 font-medium text-foreground",
                    isTotal &&
                      "bg-primary/5 font-bold text-foreground border-y border-primary/30",
                    !isSection &&
                      !isSubtotal &&
                      !isTotal &&
                      "hover:bg-muted/30",
                  )}
                >
                  {Array.from({ length: colCount }).map((_, ci) => {
                    const value = cells[ci] ?? "";
                    const isFirst = ci === 0;
                    const numeric = !isFirst && isNumberCell(value);
                    const isNegative = numeric && NEG_RE.test(value.trim());

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
                          isSection && isFirst && "text-[11px]",
                        )}
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
}) {
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!statements || statements.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !statements.some((s) => s.key === selectedKey)) {
      setSelectedKey(statements[0].key);
    }
  }, [statements, selectedKey]);

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

  if (!statements || statements.length === 0) {
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
    statements.find((s) => s.key === selectedKey) ?? statements[0];

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
        <StatementTypePills
          items={statements.map((statement) => ({
            key: statement.key,
            title: statement.title,
            tableCount: statement.data?.tables?.length ?? 0,
            hasError:
              statement.status === "error" || Boolean(statement.error),
          }))}
          selectedKey={selected.key}
          onSelect={setSelectedKey}
        />
      </div>

      <div className="flex min-w-0 flex-col">
        <StatementBlock statement={selected} compact />
      </div>
    </div>
  );
}
