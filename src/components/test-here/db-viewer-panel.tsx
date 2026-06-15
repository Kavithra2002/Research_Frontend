"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  ChevronRight,
  Database,
  FileText,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ExtractedTablesView,
  type ExtractedStatement,
  statementsFromResults,
} from "@/components/extracted/extracted-tables-view";

type Period = "Annual" | "Quarterly";

type StoredReport = {
  reportKey: string;
  reportType: "annual" | "quarterly";
  period: Period;
  year: number | null;
  quarter: string | null;
  reportGroup: string | null;
  periodLabel: string | null;
  statements: string[];
  statementCount: number;
  tableCount: number;
  model: string | null;
  generatedAt: string | null;
};

type DbCompany = {
  name: string;
  displayName: string;
  reports: StoredReport[];
};

type ListResponse = {
  source?: "mongodb" | "filesystem";
  companies?: DbCompany[];
  error?: string;
};

type DataResponse = {
  company?: string;
  meta?: Record<string, unknown> | null;
  results?: Record<string, unknown>;
  error?: string;
};

type Selection = {
  company: string;
  displayName: string;
  report: StoredReport;
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function companyReports(c: DbCompany): StoredReport[] {
  return Array.isArray(c.reports) ? c.reports : [];
}

/** Coerce API payloads so `reports` is always an array (handles partial/legacy shapes). */
function normalizeCompanies(raw: unknown): DbCompany[] {
  if (!Array.isArray(raw)) return [];

  const out: DbCompany[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    if (!name) continue;

    const displayName =
      typeof o.displayName === "string" ? o.displayName : name;

    let reports: StoredReport[] = [];
    if (Array.isArray(o.reports)) {
      reports = o.reports
        .filter(
          (r): r is StoredReport =>
            !!r &&
            typeof r === "object" &&
            typeof (r as StoredReport).reportKey === "string" &&
            (r as StoredReport).reportKey.length > 0,
        )
        .map((r) => ({
          ...r,
          statements: Array.isArray(r.statements) ? r.statements : [],
          statementCount: Number(r.statementCount) || 0,
          tableCount: Number(r.tableCount) || 0,
        }));
    }

    if (reports.length === 0) continue;
    out.push({ name, displayName, reports });
  }
  return out;
}

/** "A 2024" for annual, "Q3 2025" for quarterly (falls back gracefully). */
function reportLabel(r: StoredReport) {
  const year = r.year != null ? String(r.year) : "";
  if (r.period === "Quarterly") {
    const q = r.quarter ? r.quarter.toUpperCase() : "Q";
    return { tag: q, year };
  }
  return { tag: "Annual", year };
}

export function DbViewerPanel() {
  const [source, setSource] = React.useState<"mongodb" | "filesystem" | null>(
    null,
  );
  const [companies, setCompanies] = React.useState<DbCompany[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [statements, setStatements] = React.useState<ExtractedStatement[]>([]);
  const [dataLoading, setDataLoading] = React.useState(false);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState<{
    model: string | null;
    generatedAt: string | null;
  } | null>(null);

  const load = React.useCallback(
    async (isActive: () => boolean = () => true) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/extracted/stored-reports", {
          cache: "no-store",
        });
        const data = (await res.json()) as ListResponse;
        if (!isActive()) return;
        if (!res.ok)
          throw new Error(data.error ?? `Request failed (${res.status})`);
        setSource(data.source ?? null);
        setCompanies(normalizeCompanies(data.companies));
      } catch (e) {
        if (!isActive()) return;
        setError(e instanceof Error ? e.message : String(e));
        setCompanies([]);
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    let cancelled = false;
    load(() => !cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Drop a stale selection when the underlying report list changes.
  React.useEffect(() => {
    if (!selection) return;
    const exists = companies.some(
      (c) =>
        c.name === selection.company &&
        companyReports(c).some(
          (r) => r.reportKey === selection.report.reportKey,
        ),
    );
    if (!exists) setSelection(null);
  }, [companies, selection]);

  const openReport = React.useCallback(
    (company: DbCompany, report: StoredReport) => {
      setSelection({
        company: company.name,
        displayName: company.displayName,
        report,
      });
    },
    [],
  );

  React.useEffect(() => {
    if (!selection) {
      setStatements([]);
      setDataError(null);
      setMeta(null);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    const params = new URLSearchParams({
      company: selection.company,
      reportKey: selection.report.reportKey,
      reportType: selection.report.reportType,
    });
    fetch(`/api/extracted/report-data?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = (await res.json()) as DataResponse;
        if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setStatements(statementsFromResults(json.results ?? null));
        const m = json.meta as Record<string, unknown> | null;
        setMeta({
          model: (m?.model as string) ?? null,
          generatedAt: (m?.generated_at as string) ?? null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setDataError(e instanceof Error ? e.message : String(e));
        setStatements([]);
        setMeta(null);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const reportCount = React.useMemo(
    () => companies.reduce((n, c) => n + companyReports(c).length, 0),
    [companies],
  );

  const selectedLabel = selection ? reportLabel(selection.report) : null;

  return (
    <Card size="sm" className="flex max-h-[640px] min-h-[520px] flex-col py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" />
          <span className="font-heading text-sm font-medium">
            Database — stored reports
          </span>
          <Badge variant="secondary" className="ml-1">
            {companies.length} compan{companies.length === 1 ? "y" : "ies"}
          </Badge>
          {reportCount > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {reportCount} report{reportCount === 1 ? "" : "s"}
            </Badge>
          )}
          {source && (
            <Badge variant="outline" className="hidden text-[10px] sm:inline-flex">
              {source}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          disabled={loading}
        >
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(240px,320px)_1fr]">
        {/* ── Report tree ─────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
          {error ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          ) : loading && companies.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading…
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <div className="max-w-xs">
                <Database className="mx-auto size-8 text-muted-foreground" />
                <h3 className="mt-3 font-heading text-sm font-medium">
                  Nothing in the database yet
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Run the extraction above to push reports into MongoDB, then
                  refresh to browse them here.
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <ul className="divide-y">
                {companies.map((c) => (
                  <DbCompanyRow
                    key={c.name}
                    company={c}
                    selection={selection}
                    onOpen={openReport}
                  />
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>

        {/* ── Report detail (tables) ──────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 flex-col">
          {!selection ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center">
              <div className="max-w-sm">
                <FileText className="mx-auto size-8 text-muted-foreground" />
                <h3 className="mt-3 font-heading text-base font-medium">
                  Select a report
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick a company and report from the list to view the tables
                  stored in the database.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span
                  className="truncate text-sm font-medium"
                  title={selection.displayName}
                >
                  {selection.displayName}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 text-[10px] font-semibold",
                    selection.report.period === "Quarterly"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-blue-500/15 text-blue-600 dark:text-blue-400",
                  )}
                >
                  {selectedLabel?.tag}
                </span>
                {selectedLabel?.year ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedLabel.year}
                  </Badge>
                ) : null}
                {selection.report.reportGroup ? (
                  <span
                    className="hidden truncate text-[11px] text-muted-foreground md:inline"
                    title={selection.report.reportGroup}
                  >
                    {selection.report.reportGroup}
                  </span>
                ) : null}
                {meta?.model ? (
                  <Badge variant="outline" className="hidden text-[10px] lg:inline-flex">
                    {meta.model}
                  </Badge>
                ) : null}
                {meta?.generatedAt ? (
                  <span className="hidden text-[11px] text-muted-foreground xl:inline">
                    extracted {formatDate(meta.generatedAt)}
                  </span>
                ) : null}
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-auto">
                <ExtractedTablesView
                  statements={statements}
                  loading={dataLoading}
                  error={dataError}
                  emptyMessage="No tables stored for this report."
                  pillsSticky={false}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function DbCompanyRow({
  company,
  selection,
  onOpen,
}: {
  company: DbCompany;
  selection: Selection | null;
  onOpen: (c: DbCompany, report: StoredReport) => void;
}) {
  const isSelectedCompany = selection?.company === company.name;
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (isSelectedCompany) setOpen(true);
  }, [isSelectedCompany]);

  return (
    <li className="px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/50"
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium" title={company.displayName}>
          {company.displayName}
        </span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {companyReports(company).length}
        </Badge>
      </button>

      {open && (
        <ul className="mt-1 ml-6 flex flex-col gap-0.5 pb-1">
          {companyReports(company).map((r) => (
            <ReportRow
              key={r.reportKey}
              report={r}
              active={
                isSelectedCompany &&
                selection?.report.reportKey === r.reportKey
              }
              onClick={() => onOpen(company, r)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ReportRow({
  report,
  active,
  onClick,
}: {
  report: StoredReport;
  active: boolean;
  onClick: () => void;
}) {
  const { tag, year } = reportLabel(report);
  const isQuarterly = report.period === "Quarterly";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
          "hover:bg-muted/50",
          active && "bg-primary/10 ring-1 ring-primary/20",
        )}
      >
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span
          className={cn(
            "min-w-[1.75rem] rounded px-1.5 text-center text-[10px] font-semibold",
            isQuarterly
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-blue-500/15 text-blue-600 dark:text-blue-400",
          )}
        >
          {tag}
        </span>
        <span className="text-xs font-medium">{year || "—"}</span>
        <Separator orientation="vertical" className="h-3" />
        <span className="truncate text-[11px] text-muted-foreground">
          {report.statementCount} stmt{report.statementCount === 1 ? "" : "s"}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {report.tableCount} tbl{report.tableCount === 1 ? "" : "s"}
        </span>
      </button>
    </li>
  );
}
