"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Database,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Square,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  cancelDemoRun,
  getDemoRunProgressPct,
  getServerSnapshot,
  getSnapshot,
  getTotalUploadedTables,
  runDemo,
  subscribe,
  type DemoRunItem,
} from "@/components/test-here/demo-run-store";
import {
  runExtract,
  runDownload,
  cancelExtract,
  cancelDownload,
  liveExtractProgressPct,
  liveExtractIndeterminate,
  getSnapshot as getLiveExtractSnapshot,
  getServerSnapshot as getLiveExtractServerSnapshot,
  subscribe as subscribeLiveExtract,
} from "@/components/system/live-extraction-store";
import { ExtractionRunButtons } from "@/components/test-here/extraction-run-buttons";

type DemoFile = {
  name: string;
  relPath: string;
  size: number;
  modifiedAt: string;
};
type DemoGroup = { group: string; files: DemoFile[] };
type DemoCompany = {
  name: string;
  displayName: string;
  annual: DemoGroup[];
  quarterly: DemoGroup[];
  totalFiles: number;
};
type ListResponse = { root?: string; companies?: DemoCompany[]; error?: string };

type Period = "Annual" | "Quarterly";

type SelectedItem = DemoRunItem;

type CseCompany = { name: string; symbol: string; displayName: string };

type CseYearBlock = {
  year: number;
  annual: { year: number; report_type: string; group: string } | null;
  quarterly: { year: number; quarter?: number; report_type: string; group: string }[];
};

type CseReportSelection = {
  report_type: "Annual" | "Quarterly";
  year: number;
  quarter?: number;
};

function cseSelectionKey(sel: CseReportSelection) {
  return `${sel.report_type}-${sel.year}-${sel.quarter ?? 0}`;
}

function isOkStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "ok" || s === "skipped_existing" || s === "skipped existing";
}

// Mirror of the Python `_sanitize_company_key` so DB extraction targets the
// same company_slug used when the financial tables were stored.
function companySlugFromName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function normalizeCompanyName(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function inferYearsFromSelection(items: SelectedItem[]): number[] {
  return [
    ...new Set(
      items
        .map((i) => {
          const m = i.group.match(/(20\d{2})/);
          return m ? Number(m[1]) : null;
        })
        .filter((y): y is number => y != null),
    ),
  ].sort((a, b) => b - a);
}

function parseYearFromGroup(group: string): number | null {
  const m = group.match(/(20\d{2})/);
  return m ? Number(m[1]) : null;
}

function parseQuarterFromGroup(group: string): number {
  const m = group.match(/Q(\d)/i);
  return m ? Number(m[1]) : 0;
}

type LocalReportEntry = {
  period: Period;
  group: DemoGroup;
  sortKey: number;
};

type LocalReportYearBlock = {
  year: number;
  entries: LocalReportEntry[];
};

function buildYearSeparatedBlocks(
  annual: DemoGroup[],
  quarterly: DemoGroup[],
): LocalReportYearBlock[] {
  const byYear = new Map<number, LocalReportEntry[]>();

  const add = (year: number, entry: LocalReportEntry) => {
    const list = byYear.get(year) ?? [];
    list.push(entry);
    byYear.set(year, list);
  };

  for (const g of annual) {
    const year = parseYearFromGroup(g.group);
    if (year == null) continue;
    add(year, { period: "Annual", group: g, sortKey: 0 });
  }
  for (const g of quarterly) {
    const year = parseYearFromGroup(g.group);
    if (year == null) continue;
    const quarter = parseQuarterFromGroup(g.group);
    add(year, {
      period: "Quarterly",
      group: g,
      sortKey: quarter > 0 ? quarter : 99,
    });
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, entries]) => ({
      year,
      entries: entries.sort((a, b) => a.sortKey - b.sortKey),
    }));
}

export function DemoRunnerPanel() {
  const [companies, setCompanies] = React.useState<DemoCompany[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [cseCompanies, setCseCompanies] = React.useState<CseCompany[]>([]);
  const [cseCompaniesLoading, setCseCompaniesLoading] = React.useState(true);
  const [cseCompaniesError, setCseCompaniesError] = React.useState<string | null>(null);
  const [cseQuery, setCseQuery] = React.useState("");
  const [activeCseCompany, setActiveCseCompany] = React.useState<string | null>(null);
  const [cseCatalog, setCseCatalog] = React.useState<CseYearBlock[]>([]);
  const [cseCatalogLoading, setCseCatalogLoading] = React.useState(false);
  const [cseCatalogError, setCseCatalogError] = React.useState<string | null>(null);
  const [cseDownloads, setCseDownloads] = React.useState<Map<string, CseReportSelection>>(new Map());
  const [downloading, setDownloading] = React.useState(false);

  // relPath -> SelectedItem
  const [selected, setSelected] = React.useState<Map<string, SelectedItem>>(
    new Map(),
  );

  const {
    running,
    log,
    uploads,
    summary,
    progress,
    activeStage,
    error: runError,
  } = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const liveExtract = React.useSyncExternalStore(
    subscribeLiveExtract,
    () => getLiveExtractSnapshot().extract,
    () => getLiveExtractServerSnapshot().extract,
  );

  const loadCseCompanies = React.useCallback(async () => {
    setCseCompaniesLoading(true);
    setCseCompaniesError(null);
    try {
      const res = await fetch("/api/system/live-extraction/companies", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        companies?: CseCompany[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Failed to load companies (${res.status})`);
      }
      setCseCompanies(data.companies ?? []);
      if ((data.companies ?? []).length === 0) {
        setCseCompaniesError(
          data.error ?? "No CSE companies available. Try Refresh after market open.",
        );
      }
    } catch (e) {
      setCseCompanies([]);
      setCseCompaniesError(e instanceof Error ? e.message : String(e));
    } finally {
      setCseCompaniesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCseCompanies();
  }, [loadCseCompanies]);

  const loadCseCatalog = React.useCallback(async (company: string) => {
    setCseCatalogLoading(true);
    setCseCatalogError(null);
    try {
      const res = await fetch(
        `/api/system/live-extraction/reports?company=${encodeURIComponent(company)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        years?: CseYearBlock[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setCseCatalog(data.years ?? []);
    } catch (e) {
      setCseCatalog([]);
      setCseCatalogError(e instanceof Error ? e.message : String(e));
    } finally {
      setCseCatalogLoading(false);
    }
  }, []);

  const pickCseCompany = React.useCallback(
    (name: string) => {
      setActiveCseCompany(name);
      setCseDownloads(new Map());
      setSelected(new Map());
      void loadCseCatalog(name);
    },
    [loadCseCatalog],
  );

  const filteredCseCompanies = React.useMemo(() => {
    const q = cseQuery.trim().toLowerCase();
    if (!q) return cseCompanies.slice(0, 100);
    return cseCompanies
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [cseCompanies, cseQuery]);

  const activeLocalCompany = React.useMemo(() => {
    if (!activeCseCompany) return null;
    const target = normalizeCompanyName(activeCseCompany);
    if (!target) return null;
    const exact = companies.find(
      (c) =>
        normalizeCompanyName(c.name) === target ||
        normalizeCompanyName(c.displayName) === target,
    );
    if (exact) return exact;
    // Fallback: tolerate minor naming differences (extra suffixes/spacing)
    // between the CSE display name and the local Demo_Data folder name.
    return (
      companies.find((c) => {
        const n = normalizeCompanyName(c.name);
        const d = normalizeCompanyName(c.displayName);
        return (
          n.startsWith(target) ||
          target.startsWith(n) ||
          d.startsWith(target) ||
          target.startsWith(d)
        );
      }) ?? null
    );
  }, [companies, activeCseCompany]);

  const yearSeparatedReports = React.useMemo(() => {
    if (!activeLocalCompany) return [];
    return buildYearSeparatedBlocks(
      activeLocalCompany.annual,
      activeLocalCompany.quarterly,
    );
  }, [activeLocalCompany]);

  const pipelineRunning = running || liveExtract.running || downloading;

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/reports", { cache: "no-store" });
      const data = (await res.json()) as ListResponse;
      if (data.error) throw new Error(data.error);
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

  const toggleFile = React.useCallback(
    (company: string, period: Period, group: string, file: DemoFile) => {
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(file.relPath)) {
          next.delete(file.relPath);
        } else {
          next.set(file.relPath, {
            company,
            report_type: period,
            file_name: file.name,
            rel_path: file.relPath,
            group,
          });
        }
        return next;
      });
    },
    [],
  );

  const toggleGroup = React.useCallback(
    (company: string, period: Period, grp: DemoGroup) => {
      setSelected((prev) => {
        const next = new Map(prev);
        const allSelected = grp.files.every((f) => next.has(f.relPath));
        for (const f of grp.files) {
          if (allSelected) next.delete(f.relPath);
          else
            next.set(f.relPath, {
              company,
              report_type: period,
              file_name: f.name,
              rel_path: f.relPath,
              group: grp.group,
            });
        }
        return next;
      });
    },
    [],
  );

  const clearSelection = React.useCallback(() => setSelected(new Map()), []);

  const selectedCount = selected.size;

  const selectedItems = React.useMemo(
    () => Array.from(selected.values()),
    [selected],
  );
  const annualItems = selectedItems.filter((i) => i.report_type === "Annual");
  const quarterItems = selectedItems.filter((i) => i.report_type === "Quarterly");

  const handleRun = React.useCallback(async () => {
    if (pipelineRunning || selectedItems.length === 0) return;
    await runDemo(selectedItems);
  }, [selectedItems, pipelineRunning]);

  // File-based gating: a button is only usable for the report types whose
  // actual local PDFs the user has ticked in section 2. No company-level or
  // "all downloaded" fallback — the run acts on exactly the ticked files.
  const hasSelectedAnnual = annualItems.length > 0;
  const hasSelectedQuarterly = quarterItems.length > 0;
  const extractionReady = selectedItems.length > 0;

  const runMode = React.useCallback(
    async (
      mode:
        | "annual"
        | "quarterly"
        | "all"
        | "db-annual"
        | "db-quarterly"
        | "db-all",
    ) => {
      if (pipelineRunning || selectedItems.length === 0) return;

      // Run strictly on the files ticked in section 2 (the local file base).
      const annualToRun = annualItems;
      const quarterToRun = quarterItems;
      const allToRun = selectedItems;

      // Years come only from the ticked local files so DB extraction never
      // touches a year the user has not selected on disk.
      const annualYears = inferYearsFromSelection(annualItems);
      const allYears = inferYearsFromSelection(selectedItems);

      // DB extraction is company-scoped: derive the slug from the ticked files
      // so it writes COMB data under the selected company, not the default.
      const annualSlug = annualItems[0]
        ? companySlugFromName(annualItems[0].company)
        : null;
      const quarterSlug = quarterItems[0]
        ? companySlugFromName(quarterItems[0].company)
        : null;
      const allSlug = selectedItems[0]
        ? companySlugFromName(selectedItems[0].company)
        : null;

      if (mode === "annual") {
        if (!annualToRun.length) return;
        await runExtract({ mode: "annual", items: annualToRun });
      } else if (mode === "quarterly") {
        if (!quarterToRun.length) return;
        await runExtract({ mode: "quarterly", items: quarterToRun });
      } else if (mode === "all") {
        if (!annualToRun.length || !quarterToRun.length) return;
        await runDemo(allToRun);
      } else if (mode === "db-annual") {
        if (!annualToRun.length || !annualYears.length) return;
        await runExtract({
          mode: "db-annual",
          years: annualYears,
          companySlug: annualSlug,
        });
      } else if (mode === "db-quarterly") {
        if (!quarterToRun.length) return;
        await runExtract({
          mode: "db-quarterly",
          items: quarterToRun,
          companySlug: quarterSlug,
        });
      } else {
        if (!annualToRun.length || !quarterToRun.length || !allYears.length) {
          return;
        }
        await runExtract({
          mode: "db-all",
          years: allYears,
          companySlug: allSlug,
        });
      }
    },
    [pipelineRunning, selectedItems, annualItems, quarterItems],
  );

  const handleCseDownload = React.useCallback(async () => {
    if (!activeCseCompany || cseDownloads.size === 0 || downloading) return;
    setDownloading(true);
    try {
      await runDownload({
        company: activeCseCompany,
        reports: Array.from(cseDownloads.values()),
      });
      await load();
    } finally {
      setDownloading(false);
    }
  }, [activeCseCompany, cseDownloads, downloading, load]);

  const handleCancel = React.useCallback(() => {
    if (running) void cancelDemoRun();
    if (liveExtract.running) void cancelExtract();
    if (downloading) void cancelDownload();
  }, [running, liveExtract.running, downloading]);

  const totalUploadedTables = getTotalUploadedTables(uploads);
  const hasTotal = !!progress && progress.total > 0;
  const progressPct = getDemoRunProgressPct(progress, activeStage);
  const displayDone = progress
    ? Math.min(progress.total, progress.done + (activeStage ? 0.6 : 0))
    : 0;
  // Before we know the total (or before the first stage starts) show an
  // animated indeterminate bar instead of an empty/idle one.
  const indeterminate = running && (!hasTotal || (displayDone === 0 && !activeStage));

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Database className="size-4 text-muted-foreground" />
                Test here — extract demo reports &amp; save to DB
              </CardTitle>
              <CardDescription className="mt-1">
                Search any CSE-listed company, download annual and quarterly
                reports into{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  Demo_Data/
                </code>
                , select reports in section 2 below, then run extraction. Tables are saved to
                MongoDB as{" "}
                <span className="font-medium">Company → Year → Annual/Quarterly</span>.
                DB page data is populated only via the Run DB buttons here.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void load();
                void loadCseCompanies();
              }}
              disabled={loading || cseCompaniesLoading || pipelineRunning}
            >
              {loading || cseCompaniesLoading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              Refresh
            </Button>
          </div>
          <ExtractionRunButtons
            running={pipelineRunning}
            selectedCount={selectedCount}
            hasAnnual={hasSelectedAnnual}
            hasQuarterly={hasSelectedQuarterly}
            ready={extractionReady}
            onRun={(mode) => {
              if (mode === "all") void handleRun();
              else void runMode(mode);
            }}
            onStop={handleCancel}
            className="mt-3"
          />
          {selectedCount > 0 && !pipelineRunning ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="mt-2 text-[12px]"
            >
              Clear selection ({selectedCount})
            </Button>
          ) : null}
        </CardHeader>

        {running && (
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-3.5 animate-spin" />
                  {hasTotal
                    ? `Processing ${Math.min(progress!.done + (activeStage ? 1 : 0), progress!.total)}/${progress!.total} report(s)`
                    : "Starting..."}
                </span>
                <span>
                  {hasTotal ? `${progressPct}% · ` : ""}
                  {totalUploadedTables} table(s) uploaded
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                {indeterminate ? (
                  <div className="animate-demo-indeterminate h-full w-2/5 rounded-full bg-primary" />
                ) : (
                  <div
                    className="h-full bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${progressPct}%` }}
                  />
                )}
              </div>
            </div>

            {uploads.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 px-3 py-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Database uploads
                </span>
                {uploads.map((u, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs"
                  >
                    {u.status === "ok" ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="size-3.5 text-amber-500" />
                    )}
                    <span className="truncate font-medium" title={u.company}>
                      {u.company}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {u.reportType}
                      {u.year ? ` · ${u.year}` : ""}
                    </Badge>
                    {u.group ? (
                      <span className="truncate text-[11px] text-muted-foreground" title={u.group}>
                        {u.group}
                      </span>
                    ) : null}
                    <span className="ml-auto text-muted-foreground">
                      {u.tables} table(s)
                    </span>
                    {u.error ? (
                      <span className="truncate text-destructive" title={u.error}>
                        {u.error}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {log.length > 0 && (
              <div className="rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Activity log
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {log.length}
                  </Badge>
                </div>
                <ScrollArea className="h-56">
                  <ul className="flex flex-col gap-0.5 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {log.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        )}

        {summary && !running && (
          <CardContent className="flex flex-col gap-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
              <CheckCircle2 className="size-4 text-emerald-500" />
              <span className="font-medium">Run complete.</span>
              <span className="text-muted-foreground">
                {summary.ok} ok, {summary.failed} failed ·{" "}
                {totalUploadedTables} table(s) saved to MongoDB.
              </span>
            </div>
          </CardContent>
        )}

        {runError && !running && (
          <CardContent className="flex flex-col gap-3 border-t pt-4">
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{runError}</span>
            </div>
          </CardContent>
        )}
      </Card>

      <Card size="sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            1. Search CSE company, download &amp; pick local reports
          </CardTitle>
          <CardDescription>
            Pick any listed company, select annual/quarterly reports from the CSE
            and download them, then tick the downloaded files on the right to run.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search CSE companies…"
                value={cseQuery}
                onChange={(e) => setCseQuery(e.target.value)}
              />
            </div>
            <ScrollArea className="h-[220px] rounded-md border">
              <div className="p-1">
                {cseCompaniesLoading ? (
                  <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Loading CSE companies…
                  </div>
                ) : cseCompaniesError && filteredCseCompanies.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-destructive">{cseCompaniesError}</p>
                ) : filteredCseCompanies.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    No companies match your search.
                  </p>
                ) : null}
                {filteredCseCompanies.map((c) => (
                  <Tooltip key={c.symbol}>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          onClick={() => pickCseCompany(c.name)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
                            activeCseCompany === c.name && "bg-primary/10 font-medium",
                          )}
                        >
                          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 truncate">{c.displayName}</span>
                          <Badge
                            variant="outline"
                            className="ml-auto shrink-0 text-[10px]"
                          >
                            {c.symbol}
                          </Badge>
                        </button>
                      }
                    />
                    <TooltipContent
                      side="right"
                      sideOffset={6}
                      className="max-w-[14rem] border-0 bg-popover px-2 py-1 text-[10px] leading-snug text-popover-foreground shadow-md ring-1 ring-foreground/10 [&>svg]:hidden"
                    >
                      {c.displayName}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </ScrollArea>
          </div>
          <div className="min-w-0 space-y-3">
            {!activeCseCompany ? (
              <p className="text-sm text-muted-foreground">
                Search and select a company to see available reports.
              </p>
            ) : cseCatalogLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading CSE report catalog…
              </div>
            ) : cseCatalogError ? (
              <p className="text-sm text-destructive">{cseCatalogError}</p>
            ) : (
              <>
                <Badge variant="secondary">{activeCseCompany}</Badge>
                <ScrollArea className="h-[180px] rounded-md border p-2">
                  <div className="space-y-3">
                    {cseCatalog.map((block) => (
                      <div key={block.year}>
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">
                          {block.year}
                        </p>
                        <div className="space-y-1 pl-2">
                          {block.annual ? (
                            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40">
                              <Checkbox
                                checked={cseDownloads.has(
                                  cseSelectionKey({
                                    report_type: "Annual",
                                    year: block.year,
                                  }),
                                )}
                                onCheckedChange={() => {
                                  setCseDownloads((prev) => {
                                    const next = new Map(prev);
                                    const key = cseSelectionKey({
                                      report_type: "Annual",
                                      year: block.year,
                                    });
                                    if (next.has(key)) next.delete(key);
                                    else
                                      next.set(key, {
                                        report_type: "Annual",
                                        year: block.year,
                                      });
                                    return next;
                                  });
                                }}
                              />
                              <FileText className="size-3.5" />
                              <span className="text-sm">
                                Annual — {block.annual.group}
                              </span>
                            </label>
                          ) : null}
                          {block.quarterly.map((q) => (
                            <label
                              key={`${block.year}-${q.quarter}`}
                              className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/40"
                            >
                              <Checkbox
                                checked={cseDownloads.has(
                                  cseSelectionKey({
                                    report_type: "Quarterly",
                                    year: block.year,
                                    quarter: q.quarter,
                                  }),
                                )}
                                onCheckedChange={() => {
                                  setCseDownloads((prev) => {
                                    const next = new Map(prev);
                                    const key = cseSelectionKey({
                                      report_type: "Quarterly",
                                      year: block.year,
                                      quarter: q.quarter,
                                    });
                                    if (next.has(key)) next.delete(key);
                                    else
                                      next.set(key, {
                                        report_type: "Quarterly",
                                        year: block.year,
                                        quarter: q.quarter,
                                      });
                                    return next;
                                  });
                                }}
                              />
                              <FileText className="size-3.5" />
                              <span className="text-sm">{q.group}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <Button
                  size="sm"
                  disabled={cseDownloads.size === 0 || downloading}
                  onClick={() => void handleCseDownload()}
                >
                  {downloading ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : (
                    <Download className="mr-1 size-4" />
                  )}
                  Download selected ({cseDownloads.size})
                </Button>
              </>
            )}
          </div>

          <div className="flex min-w-0 flex-col rounded-md border bg-muted/10">
            <div className="flex items-center gap-2 border-b px-2.5 py-1.5">
              <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-xs font-medium">
                Local reports — tick to run
              </span>
              {activeLocalCompany ? (
                <Badge variant="secondary" className="ml-auto shrink-0 text-[10px]">
                  {selectedCount}/{activeLocalCompany.totalFiles}
                </Badge>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              {!activeCseCompany ? (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  Select a CSE company to see downloaded reports.
                </p>
              ) : loading && !activeLocalCompany ? (
                <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading local reports…
                </div>
              ) : !activeLocalCompany ? (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  No local PDFs yet. Download reports on the left, then tick them
                  here to run.
                </p>
              ) : (
                <ScrollArea className="h-[280px]">
                  <div className="flex flex-col gap-2 p-2">
                    {selectedCount > 0 ? (
                      <button
                        type="button"
                        onClick={clearSelection}
                        disabled={pipelineRunning}
                        className="self-start text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Clear selection ({selectedCount})
                      </button>
                    ) : null}
                    <YearGroupedLocalReports
                      company={activeLocalCompany.name}
                      blocks={yearSeparatedReports}
                      selected={selected}
                      onToggleFile={toggleFile}
                      onToggleGroup={toggleGroup}
                      disabled={pipelineRunning}
                    />
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {(liveExtract.running ||
        liveExtract.results.length > 0 ||
        liveExtract.error ||
        liveExtract.log.length > 0) && (
        <Card size="sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Extraction log</CardTitle>
            <CardDescription>
              {liveExtract.running
                ? "Live output while an extraction script is running."
                : "Last extraction run — results and output."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {liveExtract.running && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-3.5 animate-spin" />
                    {liveExtract.stageLabel
                      ? liveExtract.stageLabel
                      : liveExtract.progress && liveExtract.progress.total > 1
                        ? `Processing ${liveExtract.progress.done}/${liveExtract.progress.total} report(s)`
                        : "Working — this can take a few minutes..."}
                  </span>
                  <span>
                    {liveExtract.progress && liveExtract.progress.total > 1
                      ? `${liveExtract.progress.done}/${liveExtract.progress.total}`
                      : ""}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  {liveExtractIndeterminate(liveExtract) ? (
                    <div className="animate-demo-indeterminate h-full w-2/5 rounded-full bg-primary" />
                  ) : (
                    <div
                      className="h-full bg-primary transition-[width] duration-500 ease-out"
                      style={{ width: `${liveExtractProgressPct(liveExtract)}%` }}
                    />
                  )}
                </div>
              </div>
            )}

            {!liveExtract.running && liveExtract.error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <XCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{liveExtract.error}</span>
              </div>
            )}

            {!liveExtract.running && liveExtract.results.length > 0 && (
              <div className="rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Run result
                  </span>
                  <span className="flex items-center gap-2 text-[10px]">
                    <Badge
                      variant="secondary"
                      className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    >
                      {liveExtract.results.filter((r) => isOkStatus(r.status)).length}{" "}
                      ok
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="bg-destructive/15 text-destructive"
                    >
                      {liveExtract.results.filter((r) => !isOkStatus(r.status)).length}{" "}
                      failed
                    </Badge>
                  </span>
                </div>
                <ul className="flex flex-col divide-y">
                  {liveExtract.results.map((r, i) => {
                    const ok = isOkStatus(r.status);
                    return (
                      <li
                        key={`${r.company}/${r.group}/${i}`}
                        className="flex items-start gap-2 px-3 py-1.5 text-[11px]"
                      >
                        {ok ? (
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                        )}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">
                            {r.label || r.group || r.company || "Report"}
                          </span>
                          <span
                            className={cn(
                              "truncate",
                              ok
                                ? "text-muted-foreground"
                                : "text-destructive",
                            )}
                          >
                            {ok
                              ? r.cellsFilled != null
                                ? `${r.cellsFilled} values extracted · ${r.cellsMissing ?? 0} missing`
                                : r.tables != null
                                  ? `${r.tables} table(s) saved to MongoDB`
                                  : r.status
                              : `${r.status}${r.error ? ` — ${r.error}` : ""}`}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {liveExtract.log.length > 0 && (
              <div className="rounded-lg border bg-muted/30">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Output
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {liveExtract.log.length}
                  </Badge>
                </div>
                <ScrollArea className="h-56">
                  <ul className="flex flex-col gap-0.5 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {liveExtract.log.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      )}

    </div>
  );
}

function YearGroupedLocalReports({
  company,
  blocks,
  selected,
  onToggleFile,
  onToggleGroup,
  disabled,
}: {
  company: string;
  blocks: LocalReportYearBlock[];
  selected: Map<string, SelectedItem>;
  onToggleFile: (c: string, p: Period, g: string, f: DemoFile) => void;
  onToggleGroup: (c: string, p: Period, g: DemoGroup) => void;
  disabled: boolean;
}) {
  if (blocks.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block) => (
        <div
          key={block.year}
          className="overflow-hidden rounded-lg border bg-muted/10"
        >
          <div className="border-b bg-muted/20 px-3 py-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground">
              {block.year}
            </span>
          </div>
          <ul className="flex flex-col">
            {block.entries.map(({ period, group }) => {
              const allSel = group.files.every((f) => selected.has(f.relPath));
              const someSel = group.files.some((f) => selected.has(f.relPath));
              const label = group.group || "(root)";
              return (
                <li
                  key={`${block.year}/${period}/${group.group}`}
                  className="border-b last:border-b-0"
                >
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <Checkbox
                      checked={allSel}
                      indeterminate={someSel && !allSel}
                      onCheckedChange={() => onToggleGroup(company, period, group)}
                      disabled={disabled}
                      aria-label={`Select ${label}`}
                    />
                    <span
                      className={cn(
                        "shrink-0 rounded px-1 text-[9px] font-semibold uppercase tracking-wide",
                        period === "Quarterly"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-blue-500/15 text-blue-600 dark:text-blue-400",
                      )}
                    >
                      {period === "Quarterly" ? "Q" : "A"}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {label}
                    </span>
                  </div>
                  <ul className="flex flex-col">
                    {group.files.map((f) => {
                      const sel = selected.has(f.relPath);
                      return (
                        <li
                          key={f.relPath}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 pl-8",
                            "hover:bg-muted/40",
                            sel && "bg-primary/5",
                          )}
                        >
                          <Checkbox
                            checked={sel}
                            onCheckedChange={() =>
                              onToggleFile(company, period, group.group, f)
                            }
                            disabled={disabled}
                            aria-label={`Select ${f.name}`}
                          />
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                          <span
                            className="min-w-0 flex-1 truncate text-xs"
                            title={f.name}
                          >
                            {f.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatBytes(f.size)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
