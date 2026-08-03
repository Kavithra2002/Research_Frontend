"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileText,
  Leaf,
  Loader2,
  MinusCircle,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type NfMetric = {
  key: string;
  title: string;
  found: boolean;
  value: string;
  detail: string;
  pages: number[];
};
type NfCategory = { key: string; title: string; metrics: NfMetric[] };

type NfReport = {
  reportKey: string;
  year: number | null;
  reportingYear: string | null;
  reportGroup: string | null;
  foundCount: number;
  totalCount: number;
  categoryCount: number;
  model: string | null;
  extractedAt: string | null;
  uploadedAt: string | null;
};

type NfCompany = {
  name: string;
  displayName: string;
  reports: NfReport[];
};

type ListResponse = {
  source?: "mongodb" | "filesystem";
  companies?: NfCompany[];
  error?: string;
};

type DataResponse = {
  company?: string;
  displayName?: string;
  reportKey?: string;
  meta?: Record<string, unknown> | null;
  reportingYear?: string | null;
  companyOverview?: string;
  categories?: NfCategory[];
  foundCount?: number;
  totalCount?: number;
  error?: string;
};

type Selection = {
  company: string;
  displayName: string;
  report: NfReport;
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

function normalizeCompanies(raw: unknown): NfCompany[] {
  if (!Array.isArray(raw)) return [];
  const out: NfCompany[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    if (!name) continue;
    const displayName = typeof o.displayName === "string" ? o.displayName : name;
    const reports = Array.isArray(o.reports)
      ? (o.reports as NfReport[]).filter(
          (r) =>
            !!r &&
            typeof r === "object" &&
            typeof r.reportKey === "string" &&
            r.reportKey.length > 0,
        )
      : [];
    if (reports.length === 0) continue;
    out.push({ name, displayName, reports });
  }
  return out;
}

export function NonFinancialViewerPanel() {
  const [companies, setCompanies] = React.useState<NfCompany[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [data, setData] = React.useState<DataResponse | null>(null);
  const [dataLoading, setDataLoading] = React.useState(false);
  const [dataError, setDataError] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (isActive: () => boolean = () => true) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/extracted/non-financial", {
          cache: "no-store",
        });
        const json = (await res.json()) as ListResponse;
        if (!isActive()) return;
        if (!res.ok)
          throw new Error(json.error ?? `Request failed (${res.status})`);
        setCompanies(normalizeCompanies(json.companies));
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

  React.useEffect(() => {
    if (!selection) return;
    const exists = companies.some(
      (c) =>
        c.name === selection.company &&
        c.reports.some((r) => r.reportKey === selection.report.reportKey),
    );
    if (!exists) setSelection(null);
  }, [companies, selection]);

  const openReport = React.useCallback(
    (company: NfCompany, report: NfReport) => {
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
      setData(null);
      setDataError(null);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    const params = new URLSearchParams({
      company: selection.company,
      reportKey: selection.report.reportKey,
    });
    fetch(`/api/extracted/non-financial-data?${params.toString()}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = (await res.json()) as DataResponse;
        if (!res.ok)
          throw new Error(json.error ?? `Request failed (${res.status})`);
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setData(json);
      })
      .catch((e) => {
        if (cancelled) return;
        setDataError(e instanceof Error ? e.message : String(e));
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const reportCount = React.useMemo(
    () => companies.reduce((n, c) => n + c.reports.length, 0),
    [companies],
  );

  return (
    <Card size="sm" className="flex max-h-[640px] min-h-[520px] flex-col py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Leaf className="size-4 text-emerald-600 dark:text-emerald-400" />
          <span className="font-heading text-sm font-medium">
            Non-financial data — by company
          </span>
          <Badge variant="secondary" className="ml-1">
            {companies.length} compan{companies.length === 1 ? "y" : "ies"}
          </Badge>
          {reportCount > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {reportCount} report{reportCount === 1 ? "" : "s"}
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
        {/* ── Company / report tree ───────────────────────────────── */}
        <div className="flex min-h-0 flex-col border-b md:border-r md:border-b-0">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? (
              <div className="flex min-h-[200px] items-center justify-center p-6">
                <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              </div>
            ) : loading && companies.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center p-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading…
              </div>
            ) : companies.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center p-6 text-center">
                <div className="max-w-xs">
                  <Leaf className="mx-auto size-8 text-muted-foreground" />
                  <h3 className="mt-3 font-heading text-sm font-medium">
                    No non-financial data yet
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Run the non-financial extraction above to capture data into
                    MongoDB, then refresh to browse it here.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y">
                {companies.map((c) => (
                  <CompanyRow
                    key={c.name}
                    company={c}
                    selection={selection}
                    onOpen={openReport}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Detail ──────────────────────────────────────────────── */}
        <div className="flex min-h-0 min-w-0 flex-col">
          {!selection ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center">
              <div className="max-w-sm">
                <FileText className="mx-auto size-8 text-muted-foreground" />
                <h3 className="mt-3 font-heading text-base font-medium">
                  Select a company report
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick a company and report on the left to view the captured
                  non-financial data points.
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
                {selection.report.reportingYear || selection.report.year ? (
                  <Badge variant="secondary" className="text-[10px]">
                    {selection.report.reportingYear ??
                      String(selection.report.year)}
                  </Badge>
                ) : null}
                {data?.foundCount != null && data?.totalCount != null ? (
                  <Badge variant="outline" className="text-[10px]">
                    {data.foundCount}/{data.totalCount} data points
                  </Badge>
                ) : null}
                {data?.meta?.model ? (
                  <Badge
                    variant="outline"
                    className="hidden text-[10px] lg:inline-flex"
                  >
                    {String(data.meta.model)}
                  </Badge>
                ) : null}
                {data?.meta?.generated_at ? (
                  <span className="hidden text-[11px] text-muted-foreground xl:inline">
                    extracted {formatDate(String(data.meta.generated_at))}
                  </span>
                ) : null}
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-auto">
                <DataView
                  data={data}
                  loading={dataLoading}
                  error={dataError}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function DataView({
  data,
  loading,
  error,
}: {
  data: DataResponse | null;
  loading: boolean;
  error: string | null;
}) {
  const [showMissing, setShowMissing] = React.useState(false);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading data…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const categories = Array.isArray(data.categories) ? data.categories : [];

  return (
    <div className="flex flex-col gap-4 p-4">
      {data.companyOverview ? (
        <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Company overview
          </span>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.companyOverview}
          </p>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Captured data points
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => setShowMissing((s) => !s)}
        >
          {showMissing ? "Hide" : "Show"} not-found
        </Button>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No categories stored for this report.
        </p>
      ) : (
        categories.map((cat) => (
          <CategoryBlock
            key={cat.key}
            category={cat}
            showMissing={showMissing}
          />
        ))
      )}
    </div>
  );
}

function CategoryBlock({
  category,
  showMissing,
}: {
  category: NfCategory;
  showMissing: boolean;
}) {
  const metrics = Array.isArray(category.metrics) ? category.metrics : [];
  const found = metrics.filter((m) => m.found);
  const missing = metrics.filter((m) => !m.found);
  const visible = showMissing ? metrics : found;

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{category.title}</span>
        <Separator orientation="vertical" className="h-3" />
        <Badge variant="secondary" className="text-[10px]">
          {found.length}/{metrics.length}
        </Badge>
      </div>
      <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {visible.map((m) => (
          <li
            key={m.key}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              m.found ? "bg-background" : "border-dashed bg-muted/20 opacity-70",
            )}
          >
            <div className="flex items-center gap-2">
              {m.found ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
              ) : (
                <MinusCircle className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="font-medium">{m.title}</span>
              {m.found && m.pages.length > 0 ? (
                <span className="ml-auto text-[10px] text-muted-foreground">
                  p.{m.pages.join(", ")}
                </span>
              ) : null}
            </div>
            {m.found ? (
              <>
                <div className="mt-1 text-muted-foreground">{m.value}</div>
                {m.detail ? (
                  <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                    {m.detail}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-1 text-[11px] text-muted-foreground/70">
                Not reported
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CompanyRow({
  company,
  selection,
  onOpen,
}: {
  company: NfCompany;
  selection: Selection | null;
  onOpen: (c: NfCompany, report: NfReport) => void;
}) {
  const isSelectedCompany = selection?.company === company.name;
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (isSelectedCompany) {
      setOpen(true);
    }
  }, [isSelectedCompany, selection?.report.reportKey]);

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
        <span
          className="truncate text-sm font-medium"
          title={company.displayName}
        >
          {company.displayName}
        </span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {company.reports.length}
        </Badge>
      </button>

      {open && (
        <ul className="mt-1 ml-6 flex flex-col gap-0.5 pb-1">
          {company.reports.map((r) => (
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
  report: NfReport;
  active: boolean;
  onClick: () => void;
}) {
  const label =
    report.reportingYear ??
    (report.year != null ? String(report.year) : report.reportGroup ?? "—");
  // Show the originating report group when it adds info beyond the year label.
  const secondary =
    report.reportGroup && report.reportGroup !== label
      ? report.reportGroup
      : null;
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
        title={report.reportGroup ?? label}
      >
        <Leaf className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="min-w-0 truncate text-xs font-medium">{label}</span>
        {secondary ? (
          <span className="hidden min-w-0 truncate text-[10px] text-muted-foreground lg:inline">
            {secondary}
          </span>
        ) : null}
        <span
          className="mx-1 hidden h-3 w-px shrink-0 bg-border lg:inline"
          aria-hidden
        />
        <span className="shrink-0 truncate text-[11px] text-muted-foreground">
          {report.categoryCount} cat
        </span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {report.foundCount}/{report.totalCount}
        </span>
      </button>
    </li>
  );
}
