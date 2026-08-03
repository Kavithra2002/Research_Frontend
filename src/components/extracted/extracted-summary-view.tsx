"use client";

import * as React from "react";
import { AlertCircle, LayoutGrid, Loader2, TableProperties } from "lucide-react";

import { StatementTypePills } from "@/components/ai/statement-type-pills";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statementLabel } from "@/lib/statement-types";

const NUMBER_RE = /^\s*\(?\s*-?[\d.,]+\s*%?\)?\s*$/;
const NEG_RE = /^\s*\(.*\)\s*$/;

function isNumberCell(value: string) {
  if (!value || value === "—") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed === "–") return false;
  return NUMBER_RE.test(trimmed);
}

export type YearlySummaryRow = {
  label: string;
  style: string;
  values: Record<string, string | null>;
};

export type YearlySummaryPayload = {
  company: string;
  displayName?: string;
  statementKey: string;
  statementTitle?: string | null;
  period?: string;
  years: number[];
  rows: YearlySummaryRow[];
  yearsWithData?: number[];
  error?: string;
};

type ExtractedSummaryViewProps = {
  company: string | null;
  companyDisplayName?: string;
  availableStatements: string[];
  loadingCompanies?: boolean;
  stickyTopClassName?: string;
};

export function ExtractedSummaryView({
  company,
  companyDisplayName,
  availableStatements,
  loadingCompanies,
  stickyTopClassName = "top-[6.25rem]",
}: ExtractedSummaryViewProps) {
  const [selectedKey, setSelectedKey] = React.useState<string>("income_statement");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<YearlySummaryPayload | null>(null);

  const statementKeys = React.useMemo(() => {
    if (availableStatements.length === 0) return ["income_statement"];
    const preferred = [
      "income_statement",
      "oci",
      "sofp",
      "equity",
      "cash_flows",
    ];
    const ordered = preferred.filter((k) => availableStatements.includes(k));
    const rest = availableStatements.filter((k) => !ordered.includes(k));
    return [...ordered, ...rest];
  }, [availableStatements]);

  React.useEffect(() => {
    if (!statementKeys.includes(selectedKey)) {
      setSelectedKey(statementKeys[0] ?? "income_statement");
    }
  }, [statementKeys, selectedKey]);

  React.useEffect(() => {
    if (!company) {
      setPayload(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      company,
      statement: selectedKey,
      period: "Annual",
      from: "2017",
      to: "2025",
    });

    fetch(`/api/extracted/yearly-summary?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = (await res.json()) as YearlySummaryPayload;
        if (!res.ok) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setPayload(json);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPayload(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [company, selectedKey]);

  if (!company) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-10 text-center">
        <div className="max-w-sm">
          <LayoutGrid className="mx-auto size-8 text-muted-foreground" />
          <h3 className="mt-3 font-heading text-base font-medium">
            Select a company
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a company above to view annual figures from 2017 to 2025 in
            one table.
          </p>
        </div>
      </div>
    );
  }

  if (loadingCompanies || loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading yearly summary…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-10 text-center">
        <div className="max-w-sm">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <h3 className="mt-3 font-heading text-base font-medium">
            Could not load yearly summary
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const years = payload?.years ?? [];
  const rows = payload?.rows ?? [];
  const yearsWithData = payload?.yearsWithData ?? [];
  const label = statementLabel(
    payload?.statementKey ?? selectedKey,
    payload?.statementTitle,
  );

  if (!rows.length) {
    return (
      <div className="flex min-w-0 flex-col gap-2 p-3">
        <StatementPillBar
          statementKeys={statementKeys}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          stickyTopClassName={stickyTopClassName}
        />
        <div className="flex h-full flex-1 items-center justify-center p-10 text-center">
          <div className="max-w-sm">
            <TableProperties className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-heading text-base font-medium">
              No yearly data for {label}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {companyDisplayName ?? company} has no annual {label.toLowerCase()}{" "}
              figures for 2017–2025 yet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 p-3">
      <StatementPillBar
        statementKeys={statementKeys}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
        stickyTopClassName={stickyTopClassName}
      />

      <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <TableProperties className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h3 className="font-heading text-sm font-semibold tracking-tight">
                {label} — Yearly Summary
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                {companyDisplayName ?? payload?.displayName ?? company} · Annual
                · Group figures · {yearsWithData.length} of {years.length} years
              </p>
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {rows.filter((r) => r.style === "data" || !r.style).length} rows
          </Badge>
        </header>

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
          <table className="w-full min-w-max border-separate border-spacing-0 text-xs tabular-nums">
            <thead className="sticky top-0 z-20 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-30 border-b border-r bg-muted px-3 py-2 text-left font-semibold shadow-[2px_0_6px_-2px_rgba(0,0,0,0.18)]">
                  Line item
                </th>
                {years.map((year) => {
                  const hasData = yearsWithData.includes(year);
                  return (
                    <th
                      key={year}
                      className={cn(
                        "border-b bg-muted px-3 py-2 text-right font-semibold whitespace-nowrap",
                        !hasData && "text-muted-foreground/50",
                      )}
                    >
                      {year}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => {
                const style = row.style ?? "data";
                const isSection = style === "section";
                const isSubtotal = style === "subtotal";
                const isTotal = style === "total";

                if (isSection) {
                  return (
                    <tr key={`${row.label}-${ri}`}>
                      <td className="sticky left-0 z-[5] border-b border-r bg-muted px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-foreground shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]">
                        {row.label}
                      </td>
                      {years.map((year) => (
                        <td
                          key={year}
                          className="border-b bg-muted/40"
                          aria-hidden="true"
                        />
                      ))}
                    </tr>
                  );
                }

                const stickyLabelBg = isTotal
                  ? "bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))]"
                  : isSubtotal
                    ? "bg-[color-mix(in_oklab,var(--muted)_60%,var(--card))]"
                    : "bg-card";

                return (
                  <tr
                    key={`${row.label}-${ri}`}
                    className={cn(
                      "transition-colors",
                      !isSubtotal && !isTotal && "hover:bg-muted/30",
                    )}
                  >
                    <td
                      className={cn(
                        "sticky left-0 z-[5] border-b border-r px-3 py-1.5 text-left shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]",
                        stickyLabelBg,
                        isSubtotal && "font-medium",
                        isTotal && "font-bold border-y border-primary/30",
                      )}
                    >
                      {row.label}
                    </td>
                    {years.map((year) => {
                      const value = row.values[String(year)] ?? "—";
                      const numeric = isNumberCell(value);
                      const isNegative = numeric && NEG_RE.test(value.trim());
                      const empty = value === "—" || !value;

                      return (
                        <td
                          key={year}
                          className={cn(
                            "border-b px-3 py-1.5 text-right whitespace-nowrap",
                            isSubtotal && "bg-muted/20 font-medium",
                            isTotal &&
                              "bg-primary/5 font-bold border-y border-primary/30",
                            empty && "text-muted-foreground/40",
                            isNegative && "text-rose-600 dark:text-rose-300",
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
      </section>
    </div>
  );
}

function StatementPillBar({
  statementKeys,
  selectedKey,
  onSelect,
  stickyTopClassName,
}: {
  statementKeys: string[];
  selectedKey: string;
  onSelect: (key: string) => void;
  stickyTopClassName: string;
}) {
  return (
    <div
      className={cn(
        "z-20 -mx-3 w-[calc(100%+1.5rem)] min-w-0 border-b bg-card px-3 pb-2",
        "sticky bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80",
        stickyTopClassName,
      )}
    >
      <StatementTypePills
        items={statementKeys.map((key) => ({
          key,
          title: null,
          tableCount: 1,
          hasError: false,
        }))}
        selectedKey={selectedKey}
        onSelect={onSelect}
      />
    </div>
  );
}
