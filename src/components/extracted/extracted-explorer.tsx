"use client";

import * as React from "react";
import {
  Building2,
  ChevronsUpDown,
  Database,
  Folder,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  ExtractedTablesView,
  ExtractedStatement,
  statementsFromResults,
} from "./extracted-tables-view";

type ReportFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

type Period = "Annual" | "Quarterly";

type PeriodSummary = {
  statements: string[];
  statementCount: number;
  tableCount: number;
  model: string | null;
  generatedAt: string | null;
};

type YearNode = {
  year: number;
  annual: PeriodSummary | null;
  quarterly: PeriodSummary | null;
  availablePeriods: Period[];
};

type Company = {
  name: string;
  displayName: string;
  statements: string[];
  model: string | null;
  generatedAt: string | null;
  hasReports: boolean;
  reportTypes: Record<string, ReportFile[]>;
  totalReports: number;
  hasAnnual?: boolean;
  hasQuarterly?: boolean;
  availablePeriods?: Period[];
  quarterlyStatements?: string[];
  quarterlyGeneratedAt?: string | null;
  quarterlyModel?: string | null;
  years?: YearNode[];
};

type ListResponse = {
  source?: "mongodb" | "filesystem";
  root?: string;
  reportsRoot?: string;
  companies?: Company[];
  error?: string;
};

function periodSummaryFor(
  yearNode: YearNode | undefined,
  period: Period,
): PeriodSummary | null {
  if (!yearNode) return null;
  return period === "Quarterly" ? yearNode.quarterly : yearNode.annual;
}

/** Prefer the newest year that has both periods so Annual/Quarterly tabs work immediately. */
function preferredYear(company: Company): number | null {
  if (!company.years?.length) return null;
  const withBoth = company.years.find((y) => y.availablePeriods.length >= 2);
  return withBoth?.year ?? company.years[0]?.year ?? null;
}

function latestYearForPeriod(
  company: Company,
  target: Period,
): number | null {
  const match = company.years?.find((y) => y.availablePeriods.includes(target));
  return match?.year ?? null;
}

function companyOffersPeriod(company: Company, target: Period): boolean {
  if (company.years?.length) {
    return company.years.some((y) => y.availablePeriods.includes(target));
  }
  return (company.availablePeriods ?? []).includes(target);
}

type DataResponse = {
  company?: string;
  period?: Period;
  meta?: unknown;
  results?: Record<string, unknown>;
  error?: string;
};

function formatDate(iso: string) {
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

export function ExtractedExplorer() {
  const [dataSource, setDataSource] = React.useState<
    "mongodb" | "filesystem" | null
  >(null);
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [selectedCompany, setSelectedCompany] = React.useState<string | null>(
    null,
  );
  const [selectedYear, setSelectedYear] = React.useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const [statements, setStatements] = React.useState<ExtractedStatement[]>([]);
  const [dataLoading, setDataLoading] = React.useState(false);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [period, setPeriod] = React.useState<Period>("Annual");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extracted", { cache: "no-store" });
      const data = (await res.json()) as ListResponse;
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setDataSource(data.source ?? null);
      setCompanies(data.companies ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filteredCompanies = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      c.displayName.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q),
    );
  }, [companies, query]);

  React.useEffect(() => {
    if (!selectedCompany && companies.length > 0) {
      setSelectedCompany(companies[0].name);
    }
  }, [companies, selectedCompany]);

  const company = React.useMemo(
    () => companies.find((c) => c.name === selectedCompany) ?? null,
    [companies, selectedCompany],
  );

  const useMongoTree = dataSource === "mongodb" && (company?.years?.length ?? 0) > 0;

  const yearNode = React.useMemo(() => {
    if (!company?.years?.length || selectedYear == null) return undefined;
    return company.years.find((y) => y.year === selectedYear);
  }, [company, selectedYear]);

  const lastCompanyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!company?.years?.length) {
      setSelectedYear(null);
      return;
    }
    if (lastCompanyRef.current !== company.name) {
      lastCompanyRef.current = company.name;
      setSelectedYear(preferredYear(company));
      setPeriod("Annual");
      return;
    }
    const years = company.years.map((y) => y.year);
    if (selectedYear == null || !years.includes(selectedYear)) {
      setSelectedYear(preferredYear(company));
    }
  }, [company, selectedYear]);

  const selectPeriod = React.useCallback(
    (target: Period) => {
      if (!company) return;

      if (!useMongoTree) {
        if ((company.availablePeriods ?? []).includes(target)) {
          setPeriod(target);
        }
        return;
      }

      if (yearNode?.availablePeriods.includes(target)) {
        setPeriod(target);
        return;
      }

      const year = latestYearForPeriod(company, target);
      if (year != null) {
        setSelectedYear(year);
        setPeriod(target);
      }
    },
    [company, useMongoTree, yearNode],
  );

  React.useEffect(() => {
    if (!company) return;
    const available = useMongoTree
      ? (yearNode?.availablePeriods ?? [])
      : (company.availablePeriods ?? []);
    if (available.length === 0) return;
    if (!available.includes(period)) {
      setPeriod(available[0]);
    }
  }, [company, period, useMongoTree, yearNode]);

  React.useEffect(() => {
    if (!selectedCompany) {
      setStatements([]);
      setDataError(null);
      return;
    }
    if (useMongoTree && selectedYear == null) {
      setStatements([]);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    const params = new URLSearchParams({
      company: selectedCompany,
      period,
    });
    if (useMongoTree && selectedYear != null) {
      params.set("year", String(selectedYear));
    }
    const url = `/api/extracted/data?${params.toString()}`;
    fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as DataResponse;
        if (!res.ok) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        const next = statementsFromResults(json.results ?? null);
        setStatements(next);
      })
      .catch((e) => {
        if (cancelled) return;
        setDataError(e instanceof Error ? e.message : String(e));
        setStatements([]);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany, period, useMongoTree, selectedYear]);

  React.useEffect(() => {
    if (!pickerOpen) setQuery("");
  }, [pickerOpen]);

  const triggerLabel = company?.displayName ?? "Select a company";

  const availablePeriods: Period[] = useMongoTree
    ? (yearNode?.availablePeriods ?? [])
    : (company?.availablePeriods ?? []);
  const showPeriodToggle = company
    ? useMongoTree
      ? Boolean(company.hasAnnual && company.hasQuarterly)
      : availablePeriods.length > 1
    : false;
  const yearSummary = periodSummaryFor(yearNode, period);
  const activeStatements = useMongoTree
    ? (yearSummary?.statements ?? [])
    : period === "Quarterly"
      ? (company?.quarterlyStatements ?? [])
      : (company?.statements ?? []);
  const activeModel = useMongoTree
    ? (yearSummary?.model ?? null)
    : period === "Quarterly"
      ? (company?.quarterlyModel ?? company?.model ?? null)
      : (company?.model ?? null);
  const activeGeneratedAt = useMongoTree
    ? (yearSummary?.generatedAt ?? null)
    : period === "Quarterly"
      ? (company?.quarterlyGeneratedAt ?? null)
      : (company?.generatedAt ?? null);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-1.5 shadow-sm ring-1 ring-foreground/10 backdrop-blur supports-[backdrop-filter]:bg-card/95">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 min-w-0 max-w-[320px] justify-between gap-2 font-normal"
                    aria-label="Choose company"
                  />
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm" title={triggerLabel}>
                    {triggerLabel}
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={6}
                className="w-(--anchor-width) min-w-[280px] max-w-[360px] overflow-hidden bg-popover p-0"
              >
                <div className="border-b bg-popover p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search companies..."
                      className="h-9 pl-8"
                      aria-label="Search companies"
                    />
                  </div>
                </div>
                <div className="max-h-[320px] overflow-y-auto overscroll-contain bg-popover">
                  <ul className="flex flex-col gap-0.5 p-1">
                    {loading && companies.length === 0 ? (
                      <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                        Loading companies...
                      </li>
                    ) : null}
                    {error ? (
                      <li className="px-2 py-3 text-xs text-destructive">
                        {error}
                      </li>
                    ) : null}
                    {!loading && filteredCompanies.length === 0 && !error ? (
                      <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                        {companies.length === 0
                          ? "No extracted companies yet."
                          : `No companies match "${query}".`}
                      </li>
                    ) : null}
                    {filteredCompanies.map((c) => {
                      const isActive = c.name === selectedCompany;
                      const periodTags: Period[] = [];
                      if (c.hasAnnual) periodTags.push("Annual");
                      if (c.hasQuarterly) periodTags.push("Quarterly");
                      // Show whichever statement count is "richer" for the
                      // pill on the right of each row.
                      const summaryCount = c.years?.length
                        ? c.years.reduce(
                            (max, y) =>
                              Math.max(
                                max,
                                y.annual?.statementCount ?? 0,
                                y.quarterly?.statementCount ?? 0,
                              ),
                            0,
                          )
                        : Math.max(
                            c.statements.length,
                            c.quarterlyStatements?.length ?? 0,
                          );
                      return (
                        <li key={c.name}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCompany(c.name);
                              setPickerOpen(false);
                            }}
                            className={cn(
                              "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                              "hover:bg-muted",
                              isActive && "bg-muted text-foreground",
                            )}
                          >
                            <Folder
                              className={cn(
                                "size-4 shrink-0 text-muted-foreground",
                                isActive && "text-foreground",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-sm"
                                title={c.displayName}
                              >
                                {c.displayName}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                                <Sparkles className="size-3" />
                                {c.years?.length
                                  ? `${c.years.length} yr${c.years.length === 1 ? "" : "s"}`
                                  : `${c.statements.length} stmt${c.statements.length === 1 ? "" : "s"}`}
                                {c.totalReports > 0 ? (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {c.totalReports} report
                                      {c.totalReports === 1 ? "" : "s"}
                                    </span>
                                  </>
                                ) : null}
                                {periodTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className={cn(
                                      "ml-0.5 rounded px-1 text-[9px] font-medium",
                                      tag === "Quarterly"
                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                        : "bg-blue-500/15 text-blue-600 dark:text-blue-400",
                                    )}
                                  >
                                    {tag === "Quarterly" ? "Q" : "A"}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <Badge
                              variant={isActive ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {summaryCount}
                            </Badge>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
            <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">
              {companies.length} total
            </Badge>
            {company && useMongoTree && (company.years?.length ?? 0) > 0 ? (
              <div
                role="tablist"
                aria-label="Report year"
                className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
              >
                {company.years!.map((y) => {
                  const active = selectedYear === y.year;
                  return (
                    <button
                      key={y.year}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedYear(y.year)}
                      className={cn(
                        "rounded-sm px-2 py-1 text-[11px] font-medium transition-colors",
                        active
                          ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {y.year}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {company && showPeriodToggle ? (
              <div
                role="tablist"
                aria-label="Report period"
                className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5"
              >
                {(["Annual", "Quarterly"] as const).map((p) => {
                  const reachable = companyOffersPeriod(company, p);
                  const inCurrentYear = availablePeriods.includes(p);
                  const active = period === p;
                  const jumpYear =
                    useMongoTree && reachable && !inCurrentYear
                      ? latestYearForPeriod(company, p)
                      : null;
                  return (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      disabled={!reachable}
                      onClick={() => selectPeriod(p)}
                      title={
                        !reachable
                          ? `${p} extraction not available for this company`
                          : jumpYear != null
                            ? `Show ${p} statements (${jumpYear})`
                            : `Show ${p} statements`
                      }
                      className={cn(
                        "rounded-sm px-2 py-1 text-[11px] font-medium transition-colors",
                        active
                          ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
                          : "text-muted-foreground hover:text-foreground",
                        !reachable &&
                          "cursor-not-allowed opacity-40 hover:text-muted-foreground",
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {activeModel ? (
              <Badge variant="secondary" className="hidden text-[10px] md:inline-flex">
                {activeModel}
              </Badge>
            ) : null}
            {company ? (
              <span className="hidden truncate text-[11px] text-muted-foreground lg:inline">
                {activeStatements.length} stmt
                {activeStatements.length === 1 ? "" : "s"}
                {activeGeneratedAt
                  ? ` · generated ${formatDate(activeGeneratedAt)}`
                  : null}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => load()}
              disabled={loading}
              aria-label="Refresh"
              title="Refresh"
            >
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
            </Button>
          </div>
      </div>

      <Card
        className="flex min-w-0 flex-col gap-0 overflow-visible py-0"
        size="sm"
      >
        {!company ? (
          <CardContent className="py-10 text-center">
            <Database className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-heading text-base font-medium">
              Select a company
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the company picker above to browse OpenAI-extracted financial
              statements as tables.
            </p>
          </CardContent>
        ) : (
          <CardContent className="px-0 py-0">
            <ExtractedTablesView
              statements={statements}
              loading={dataLoading}
              error={dataError}
              emptyMessage="No extracted JSON statements found for this company."
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
