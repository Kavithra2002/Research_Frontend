"use client";

import * as React from "react";
import { AlertCircle, LayoutGrid, Loader2, TableProperties } from "lucide-react";

import { StatementTypePills } from "@/components/ai/statement-type-pills";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statementLabel } from "@/lib/statement-types";
import {
  FinancialTable,
  type ExtractedTable,
} from "./extracted-tables-view";

export type YearlySummaryRow = {
  label: string;
  style: string;
  values: Record<string, string | null>;
  /** Present only in older years — shown under a separator in Listed. */
  priorYearsOnly?: boolean;
};

export type YearlySummaryPayload = {
  company: string;
  displayName: string;
  statementKey: string;
  statementTitle: string | null;
  period: string;
  years: number[];
  rows: YearlySummaryRow[];
  yearsWithData: number[];
  referenceYear?: number | null;
  error?: string;
};

/** Default Listed span — newest → oldest when displayed. */
export const DEFAULT_LISTED_FROM_YEAR = 2016;
export const DEFAULT_LISTED_TO_YEAR = 2025;

type ExtractedSummaryViewProps = {
  company: string | null;
  companyDisplayName?: string;
  availableStatements: string[];
  /** Annual years available for this company (any order). */
  years?: number[];
  loadingCompanies?: boolean;
  stickyTopClassName?: string;
};

function cellsForRow(
  row: YearlySummaryRow,
  yearsDesc: number[],
): string[] {
  return [
    row.label,
    ...yearsDesc.map((year) => {
      const v = row.values[String(year)];
      return v == null || v === "" ? "" : v;
    }),
  ];
}

function toListedTable(
  payload: YearlySummaryPayload,
  yearsDesc: number[],
): ExtractedTable {
  const headerRow = ["", ...yearsDesc.map(String)];
  const main = payload.rows.filter((r) => !r.priorYearsOnly);
  const prior = payload.rows.filter((r) => r.priorYearsOnly);

  const rows: ExtractedTable["rows"] = main.map((row) => ({
    cells: cellsForRow(row, yearsDesc),
    style: row.style,
  }));

  if (prior.length > 0) {
    const ref = payload.referenceYear;
    rows.push({
      cells: [
        ref != null
          ? `Lines only in years before ${ref} (not in every report)`
          : "Lines only in older years (not in every report)",
        ...yearsDesc.map(() => ""),
      ],
      style: "highlight-section",
    });
    for (const row of prior) {
      // Soft highlight so older-only lines are easy to spot vs current-year rows.
      const base = (row.style || "data").toLowerCase();
      rows.push({
        cells: cellsForRow(row, yearsDesc),
        style:
          base === "section" || base === "total" || base === "subtotal"
            ? base
            : "highlight",
      });
    }
  }

  return {
    caption: `${statementLabel(payload.statementKey, payload.statementTitle)} — Listed (Group)`,
    header_rows: [headerRow],
    rows,
  };
}

export function ExtractedSummaryView({
  company,
  companyDisplayName,
  availableStatements,
  years: yearsProp = [],
  loadingCompanies,
  stickyTopClassName = "top-[6.25rem]",
}: ExtractedSummaryViewProps) {
  const [selectedKey, setSelectedKey] = React.useState<string>("income_statement");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [payload, setPayload] = React.useState<YearlySummaryPayload | null>(null);

  const yearsDesc = React.useMemo(() => {
    const fromProp = yearsProp.filter((y) => Number.isFinite(y));
    const lo = fromProp.length
      ? Math.min(DEFAULT_LISTED_FROM_YEAR, ...fromProp)
      : DEFAULT_LISTED_FROM_YEAR;
    const hi = fromProp.length
      ? Math.max(DEFAULT_LISTED_TO_YEAR, ...fromProp)
      : DEFAULT_LISTED_TO_YEAR;
    const years: number[] = [];
    for (let y = hi; y >= lo; y -= 1) years.push(y);
    return years;
  }, [yearsProp]);

  const fromYear = yearsDesc[yearsDesc.length - 1] ?? DEFAULT_LISTED_FROM_YEAR;
  const toYear = yearsDesc[0] ?? DEFAULT_LISTED_TO_YEAR;

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
      from: String(fromYear),
      to: String(toYear),
    });

    fetch(`/api/extracted/yearly-summary?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = (await res.json()) as YearlySummaryPayload;
        if (!res.ok) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }
        if (!cancelled) setPayload(json);
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
  }, [company, selectedKey, fromYear, toYear]);

  const displayYears = yearsDesc;
  const table =
    payload && payload.rows.length > 0
      ? toListedTable(payload, displayYears)
      : null;
  const label = statementLabel(selectedKey);

  if (!company) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-10 text-center">
        <div className="max-w-sm">
          <LayoutGrid className="mx-auto size-8 text-muted-foreground" />
          <h3 className="mt-3 font-heading text-base font-medium">
            Select a company
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a company above to list Group figures year by year.
          </p>
        </div>
      </div>
    );
  }

  if (loadingCompanies || loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading listed years…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-1 items-center justify-center p-10 text-center">
        <div className="max-w-sm">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <h3 className="mt-3 font-heading text-base font-medium">
            Could not load listed years
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
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

      {!table ? (
        <div className="flex h-full flex-1 items-center justify-center p-10 text-center">
          <div className="max-w-sm">
            <TableProperties className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-heading text-base font-medium">
              No listed data for {label}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {companyDisplayName ?? company} has no annual{" "}
              {label.toLowerCase()} Group figures across {fromYear}–{toYear}.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
            <p className="text-xs text-muted-foreground">
              {payload?.displayName ?? companyDisplayName ?? company} · Annual ·
              Group figures · {payload?.yearsWithData?.length ?? 0} of{" "}
              {displayYears.length} years
            </p>
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {displayYears[0]}–{displayYears[displayYears.length - 1]}
            </Badge>
          </div>
          <FinancialTable table={table} />
        </div>
      )}
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
