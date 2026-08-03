"use client";

import * as React from "react";
import {
  AlertCircle,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  Globe2,
  Lightbulb,
  Loader2,
  Newspaper,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
  StopCircle,
  TerminalSquare,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  cancelAnalysis as storeCancelAnalysis,
  getServerSnapshot,
  getSnapshot,
  runAnalysis as storeRunAnalysis,
  subscribe as subscribeNonFinancialStore,
  type NonFinancialResult,
  type RealWorldPoint,
  type SectionFound,
} from "@/components/ai/non-financial-store";
import {
  getServerSnapshot as getLiveExtractServerSnapshot,
  getSnapshot as getLiveExtractSnapshot,
  liveExtractIndeterminate,
  liveExtractProgressPct,
  runDownload,
  runExtract,
  subscribe as subscribeLiveExtract,
} from "@/components/system/live-extraction-store";
import { cn } from "@/lib/utils";

type CseCompany = { name: string; symbol: string; displayName: string };

type CseAnnual = {
  year: number;
  report_type: string;
  group: string;
  file_name: string;
};

type CseQuarterly = CseAnnual & { quarter?: number };

type CseYearBlock = {
  year: number;
  annual: CseAnnual | null;
  quarterly: CseQuarterly[];
};

type CseReportSelection = {
  report_type: "Annual" | "Quarterly";
  year: number;
  quarter?: number;
};

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

type SelectedItem = {
  company: string;
  report_type: "Annual" | "Quarterly";
  file_name: string;
  rel_path: string;
  group: string;
};

/** Must match ANALYSIS_SECTION_KEYS in backend/non_financial_script.py */
const ANALYSIS_SECTION_KEYS = new Set([
  "about_us",
  "financial_highlights",
  "mda",
  "risk_management",
  "statistical_summary",
]);

const impactStyle: Record<
  NonNullable<RealWorldPoint["impact"]>,
  { dot: string; chip: string; text: string }
> = {
  positive: {
    dot: "bg-emerald-500",
    chip: "border-emerald-500/30 bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  negative: {
    dot: "bg-rose-500",
    chip: "border-rose-500/30 bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
  },
  mixed: {
    dot: "bg-amber-500",
    chip: "border-amber-500/30 bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
  },
  neutral: {
    dot: "bg-zinc-400",
    chip: "border-zinc-500/30 bg-zinc-500/10",
    text: "text-zinc-600 dark:text-zinc-400",
  },
};

function cseSelectionKey(sel: CseReportSelection) {
  return `${sel.report_type}-${sel.year}-${sel.quarter ?? 0}`;
}

function normalizeCompanyName(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function isOkStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "ok" || s === "skipped_existing" || s === "skipped existing";
}

export function NonFinancialExplorer() {
  const store = React.useSyncExternalStore(
    subscribeNonFinancialStore,
    getSnapshot,
    getServerSnapshot,
  );

  const liveExtract = React.useSyncExternalStore(
    subscribeLiveExtract,
    () => getLiveExtractSnapshot().extract,
    () => getLiveExtractServerSnapshot().extract,
  );

  const [cseCompanies, setCseCompanies] = React.useState<CseCompany[]>([]);
  const [cseQuery, setCseQuery] = React.useState("");
  const [activeCseCompany, setActiveCseCompany] = React.useState<string | null>(null);
  const [cseCatalog, setCseCatalog] = React.useState<CseYearBlock[]>([]);
  const [cseCatalogLoading, setCseCatalogLoading] = React.useState(false);
  const [cseCatalogError, setCseCatalogError] = React.useState<string | null>(null);
  const [cseDownloads, setCseDownloads] = React.useState<
    Map<string, CseReportSelection>
  >(new Map());
  const [downloading, setDownloading] = React.useState(false);

  const [localCompanies, setLocalCompanies] = React.useState<DemoCompany[]>([]);
  const [loadingLocal, setLoadingLocal] = React.useState(true);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<Map<string, SelectedItem>>(
    new Map(),
  );

  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const logScrollRef = React.useRef<HTMLDivElement | null>(null);

  const loadLocal = React.useCallback(async () => {
    setLoadingLocal(true);
    setLocalError(null);
    try {
      const res = await fetch("/api/demo/reports", { cache: "no-store" });
      const data = (await res.json()) as {
        companies?: DemoCompany[];
        error?: string;
      };
      if (data.error) throw new Error(data.error);
      setLocalCompanies(data.companies ?? []);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
      setLocalCompanies([]);
    } finally {
      setLoadingLocal(false);
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/system/live-extraction/companies", {
          cache: "no-store",
        });
        const data = (await res.json()) as { companies?: CseCompany[] };
        setCseCompanies(data.companies ?? []);
      } catch {
        setCseCompanies([]);
      }
    })();
    void loadLocal();
  }, [loadLocal]);

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
          c.symbol.toLowerCase().includes(q) ||
          c.displayName.toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [cseCompanies, cseQuery]);

  const activeLocalCompany = React.useMemo(() => {
    if (!activeCseCompany) return null;
    const target = normalizeCompanyName(activeCseCompany);
    if (!target) return null;
    const exact = localCompanies.find(
      (c) =>
        normalizeCompanyName(c.name) === target ||
        normalizeCompanyName(c.displayName) === target,
    );
    if (exact) return exact;
    return (
      localCompanies.find((c) => {
        const n = normalizeCompanyName(c.name);
        const d = normalizeCompanyName(c.displayName);
        return n.includes(target) || target.includes(n) || d.includes(target);
      }) ?? null
    );
  }, [activeCseCompany, localCompanies]);

  const selectedItems = React.useMemo(
    () => Array.from(selected.values()),
    [selected],
  );
  const selectedCount = selectedItems.length;
  const primarySelection = selectedItems[0] ?? null;

  const toggleFile = React.useCallback(
    (
      company: string,
      period: "Annual" | "Quarterly",
      group: string,
      file: DemoFile,
    ) => {
      setSelected((prev) => {
        const next = new Map(prev);
        if (next.has(file.relPath)) next.delete(file.relPath);
        else
          next.set(file.relPath, {
            company,
            report_type: period,
            file_name: file.name,
            rel_path: file.relPath,
            group,
          });
        return next;
      });
    },
    [],
  );

  const toggleGroup = React.useCallback(
    (company: string, period: "Annual" | "Quarterly", grp: DemoGroup) => {
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

  const handleCseDownload = React.useCallback(async () => {
    if (!activeCseCompany || cseDownloads.size === 0 || downloading) return;
    setDownloading(true);
    try {
      await runDownload({
        company: activeCseCompany,
        reports: Array.from(cseDownloads.values()),
      });
      await loadLocal();
    } finally {
      setDownloading(false);
    }
  }, [activeCseCompany, cseDownloads, downloading, loadLocal]);

  const runNonFinancialExtractor = React.useCallback(async () => {
    if (selectedCount === 0 || liveExtract.running) return;
    await runExtract({ mode: "non-financial", items: selectedItems });
  }, [selectedCount, selectedItems, liveExtract.running]);

  const runAnalysis = React.useCallback(async () => {
    if (!primarySelection || store.running) return;
    await storeRunAnalysis({
      company: primarySelection.company,
      demoRelPath: primarySelection.rel_path,
    });
  }, [primarySelection, store.running]);

  const handleConfirmCancel = React.useCallback(() => {
    setConfirmingCancel(false);
    void storeCancelAnalysis();
  }, []);

  const pipelineBusy =
    store.running || liveExtract.running || downloading;

  React.useEffect(() => {
    if (store.running && store.company) {
      setActiveCseCompany(store.company);
    }
  }, [store.running, store.company]);

  React.useEffect(() => {
    if (!store.running) setConfirmingCancel(false);
  }, [store.running]);

  const matchesSelected =
    !store.company || store.company === activeCseCompany;
  const running = matchesSelected && store.running;
  const sectionsFound: SectionFound[] = matchesSelected
    ? store.sectionsFound
    : [];
  const logs = matchesSelected ? store.logs : [];
  const result = matchesSelected ? store.result : null;
  const runError = matchesSelected ? store.error : null;
  const progress = matchesSelected ? store.progress : null;

  React.useEffect(() => {
    const el = logScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm ring-1 ring-foreground/10 backdrop-blur supports-[backdrop-filter]:bg-card/95">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {activeCseCompany ? (
            <Badge variant="secondary" className="gap-1 font-normal">
              <Building2 className="size-3" />
              {activeLocalCompany?.displayName ?? activeCseCompany}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              Search and select a CSE company below
            </span>
          )}
          {selectedCount > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              {selectedCount} file(s) selected
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadLocal()}
            disabled={loadingLocal || pipelineBusy}
          >
            {loadingLocal ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 size-3.5" />
            )}
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={selectedCount === 0 || liveExtract.running || store.running}
            onClick={() => void runNonFinancialExtractor()}
          >
            {liveExtract.running ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 size-3.5" />
            )}
            Run extractor
          </Button>
          {running ? (
            <Popover open={confirmingCancel} onOpenChange={setConfirmingCancel}>
              <PopoverTrigger
                render={
                  <Button variant="destructive" size="sm" className="gap-2">
                    <StopCircle className="size-4" />
                    Stop
                  </Button>
                }
              />
              <PopoverContent align="end" className="w-72">
                <div className="text-sm font-medium">
                  Cancel the running analysis?
                </div>
                <div className="text-xs text-muted-foreground">
                  The current AI briefing will be discarded.
                </div>
                <div className="mt-2 flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setConfirmingCancel(false)}
                  >
                    Keep running
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleConfirmCancel}
                    autoFocus
                  >
                    Yes, cancel
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Button
              size="sm"
              onClick={() => void runAnalysis()}
              disabled={!primarySelection || pipelineBusy}
              className="gap-2"
            >
              <PlayCircle className="size-4" />
              Proceed the Non - financial data
            </Button>
          )}
        </div>
      </div>

      <Card size="sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Search CSE company, download &amp; pick local reports
          </CardTitle>
          <CardDescription>
            Same flow as Development: search any listed company (e.g. LOLC),
            download annual reports into Demo_Data, tick files on the right, then
            run the extractor or generate the AI briefing.
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
                {filteredCseCompanies.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {cseQuery.trim()
                      ? `No companies match "${cseQuery.trim()}".`
                      : "Loading companies…"}
                  </p>
                ) : (
                  filteredCseCompanies.map((c) => (
                    <button
                      key={c.symbol}
                      type="button"
                      onClick={() => pickCseCompany(c.name)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60",
                        activeCseCompany === c.name && "bg-primary/10 font-medium",
                      )}
                    >
                      <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate">{c.displayName}</span>
                      <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                        {c.symbol}
                      </Badge>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="min-w-0 space-y-3">
            {!activeCseCompany ? (
              <p className="text-sm text-muted-foreground">
                Search and select a company to see available reports on the CSE.
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
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
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
              ) : loadingLocal && !activeLocalCompany ? (
                <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Loading local reports…
                </div>
              ) : localError ? (
                <p className="p-3 text-center text-xs text-destructive">{localError}</p>
              ) : !activeLocalCompany ? (
                <p className="p-3 text-center text-xs text-muted-foreground">
                  No local PDFs yet. Download an annual report on the left, then
                  tick it here to run the extractor or generate a briefing.
                </p>
              ) : (
                <ScrollArea className="h-[230px]">
                  <div className="flex flex-col gap-2 p-2">
                    {selectedCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => setSelected(new Map())}
                        disabled={pipelineBusy}
                        className="self-start text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Clear selection ({selectedCount})
                      </button>
                    ) : null}
                    <LocalPeriodSection
                      label="Annual"
                      period="Annual"
                      company={activeLocalCompany.name}
                      groups={activeLocalCompany.annual}
                      selected={selected}
                      onToggleFile={toggleFile}
                      onToggleGroup={toggleGroup}
                      disabled={pipelineBusy}
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
            <CardTitle className="text-sm font-semibold">Extractor log</CardTitle>
            <CardDescription>
              {liveExtract.running
                ? "Live output from the non-financial extraction script."
                : "Last extractor run — results and output."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {liveExtract.running && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-3.5 animate-spin" />
                    {liveExtract.stageLabel ?? "Running non-financial extractor…"}
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
                            {r.company}
                            {r.group ? ` · ${r.group}` : ""}
                          </span>
                          <span
                            className={cn(
                              "truncate",
                              ok ? "text-muted-foreground" : "text-destructive",
                            )}
                          >
                            {ok
                              ? r.status
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
              <ScrollArea className="h-48 rounded-md border bg-muted/20 p-2 font-mono text-[11px]">
                {liveExtract.log.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      )}

      {runError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Analysis failed</AlertTitle>
          <AlertDescription>{runError}</AlertDescription>
        </Alert>
      ) : null}

      {(running || sectionsFound.length > 0 || logs.length > 0) && !result ? (
        <Card size="sm" className="overflow-hidden">
          <CardContent className="flex min-w-0 flex-col gap-3 py-3">
            <div className="flex items-center gap-2 text-sm">
              {running ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <CheckCircle2 className="size-4 text-emerald-500" />
              )}
              <span className="font-medium">
                {running ? "Analysing report…" : "Run complete"}
              </span>
              {progress ? (
                <span className="ml-2 truncate text-xs text-muted-foreground">
                  {progress.message}
                  {typeof progress.current === "number" &&
                  typeof progress.total === "number"
                    ? ` (${progress.current}/${progress.total})`
                    : null}
                </span>
              ) : null}
            </div>

            {sectionsFound.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {sectionsFound.map((s) => (
                  <span
                    key={`${s.key}-${s.pages.join("-")}`}
                    className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                    title={`Pages ${s.pages.join(", ")}`}
                  >
                    <Sparkles className="size-3 text-primary/70" />
                    <span className="font-medium text-foreground">{s.title}</span>
                    <span className="opacity-70">· {s.pages.length}p</span>
                  </span>
                ))}
              </div>
            ) : null}

            <Separator />

            <div
              ref={logScrollRef}
              className="max-h-64 overflow-auto rounded-md bg-muted/30 p-2 font-mono text-[11px] leading-relaxed"
            >
              {logs.length === 0 ? (
                <div className="flex items-center gap-2 px-1 py-2 text-muted-foreground">
                  <TerminalSquare className="size-3" />
                  Waiting for output…
                </div>
              ) : (
                logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "whitespace-pre-wrap break-words px-1 py-0.5",
                      entry.level === "error" && "text-destructive",
                      entry.level === "warning" &&
                        "text-amber-600 dark:text-amber-400",
                      entry.level === "stderr" &&
                        "text-rose-600 dark:text-rose-400",
                      entry.level === "section" &&
                        "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {entry.message}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <NonFinancialResultView result={result} sectionsFound={sectionsFound} />
      ) : null}

      {!running && !result && logs.length === 0 && !liveExtract.running ? (
        <Card size="sm">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Newspaper className="size-8 text-muted-foreground" />
            <h3 className="font-heading text-base font-medium">
              Generate the non-financial briefing
            </h3>
            <p className="max-w-xl text-sm text-muted-foreground">
              Search for a company (e.g. LOLC), download its annual report, tick
              the file on the right, then click <strong>Run extractor</strong> to
              capture structured metrics or <strong>Proceed the Non - financial
              data</strong> for the AI briefing.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function LocalPeriodSection({
  label,
  period,
  company,
  groups,
  selected,
  onToggleFile,
  onToggleGroup,
  disabled,
}: {
  label: string;
  period: "Annual" | "Quarterly";
  company: string;
  groups: DemoGroup[];
  selected: Map<string, SelectedItem>;
  onToggleFile: (
    c: string,
    p: "Annual" | "Quarterly",
    g: string,
    f: DemoFile,
  ) => void;
  onToggleGroup: (c: string, p: "Annual" | "Quarterly", g: DemoGroup) => void;
  disabled: boolean;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="rounded-lg border bg-muted/10">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="rounded bg-blue-500/15 px-1.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
          {label}
        </span>
        <Separator orientation="vertical" className="h-3" />
        <span className="text-[11px] text-muted-foreground">
          {groups.reduce((n, g) => n + g.files.length, 0)} file(s)
        </span>
      </div>
      <ul className="flex flex-col">
        {groups.map((grp) => {
          const allSel = grp.files.every((f) => selected.has(f.relPath));
          const someSel = grp.files.some((f) => selected.has(f.relPath));
          return (
            <li key={`${period}/${grp.group}`} className="border-b last:border-b-0">
              <div className="flex items-center gap-2 px-3 py-1.5">
                <Checkbox
                  checked={allSel}
                  indeterminate={someSel && !allSel}
                  onCheckedChange={() => onToggleGroup(company, period, grp)}
                  disabled={disabled}
                  aria-label={`Select ${grp.group || label}`}
                />
                <span className="truncate text-xs font-medium">
                  {grp.group || "(root)"}
                </span>
              </div>
              <ul className="flex flex-col">
                {grp.files.map((f) => (
                  <li key={f.relPath}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1 pl-9 hover:bg-muted/30">
                      <Checkbox
                        checked={selected.has(f.relPath)}
                        onCheckedChange={() =>
                          onToggleFile(company, period, grp.group, f)
                        }
                        disabled={disabled}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px]">
                        {f.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatBytes(f.size)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NonFinancialResultView({
  result,
  sectionsFound,
}: {
  result: NonFinancialResult;
  sectionsFound: SectionFound[];
}) {
  const sectionPagesMap = React.useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of result.sections_found ?? sectionsFound) {
      if (!ANALYSIS_SECTION_KEYS.has(s.key)) continue;
      map.set(s.key, s.pages);
    }
    return map;
  }, [result.sections_found, sectionsFound]);

  const sectionSummaries = (result.section_summaries ?? []).filter((sec) =>
    ANALYSIS_SECTION_KEYS.has(sec.key),
  );
  const realWorld = result.real_world_analysis ?? { summary: "", points: [] };

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardContent className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="size-4 text-muted-foreground" />
            <h2 className="font-heading text-base font-semibold">
              Company overview
            </h2>
            {result.model ? (
              <Badge variant="secondary" className="text-[10px]">
                {result.model}
              </Badge>
            ) : null}
            {result.generated_at ? (
              <Badge variant="secondary" className="text-[10px]">
                {new Date(result.generated_at).toLocaleString()}
              </Badge>
            ) : null}
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {result.company_overview?.trim() || "No overview returned."}
          </p>
          {result.usage?.total_tokens ? (
            <p className="text-[10px] text-muted-foreground">
              Tokens used: {result.usage.total_tokens.toLocaleString()} (prompt{" "}
              {result.usage.prompt_tokens ?? "?"} + completion{" "}
              {result.usage.completion_tokens ?? "?"})
            </p>
          ) : null}
        </CardContent>
      </Card>

      {sectionSummaries.length > 0 ? (
        <Card size="sm">
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <h2 className="font-heading text-base font-semibold">
                Business section breakdown
              </h2>
              <Badge variant="secondary" className="text-[10px]">
                {sectionSummaries.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {sectionSummaries.map((sec) => {
                const pages = sectionPagesMap.get(sec.key) ?? [];
                return (
                  <div
                    key={sec.key}
                    className="rounded-lg border bg-card/60 p-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                      <h3 className="font-medium leading-tight">{sec.title}</h3>
                      {pages.length > 0 ? (
                        <Badge
                          variant="secondary"
                          className="ml-auto text-[10px]"
                          title={`Pages ${pages.join(", ")}`}
                        >
                          {pages.length === 1
                            ? `p.${pages[0]}`
                            : `pp. ${pages[0]}–${pages[pages.length - 1]}`}
                        </Badge>
                      ) : null}
                    </div>
                    {sec.summary ? (
                      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                        {sec.summary}
                      </p>
                    ) : null}
                    {sec.highlights && sec.highlights.length > 0 ? (
                      <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
                        {sec.highlights.map((h, i) => (
                          <li key={i} className="leading-snug">
                            {h}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {realWorld.points && realWorld.points.length > 0 ? (
        <Card size="sm">
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-2">
              <Globe2 className="size-4 text-muted-foreground" />
              <h2 className="font-heading text-base font-semibold">
                Current real-world scenarios
              </h2>
              <Badge variant="secondary" className="text-[10px]">
                {realWorld.points.length} point
                {realWorld.points.length === 1 ? "" : "s"}
              </Badge>
            </div>
            {realWorld.summary ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {realWorld.summary}
              </p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {realWorld.points.map((point, idx) => {
                const impact = point.impact ?? "neutral";
                const s = impactStyle[impact];
                return (
                  <li
                    key={`${idx}-${point.title}`}
                    className={cn(
                      "rounded-lg border bg-card/60 p-3 shadow-sm",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex size-2 rounded-full",
                          s.dot,
                        )}
                        aria-hidden
                      />
                      <h3 className="font-medium leading-tight">
                        {point.title || `Point ${idx + 1}`}
                      </h3>
                      <span
                        className={cn(
                          "ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                          s.chip,
                          s.text,
                        )}
                      >
                        <Lightbulb className="size-3" />
                        {impact}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                      {point.explanation}
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {result.overall_conclusion ? (
        <Card size="sm">
          <CardContent className="flex flex-col gap-2 py-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" />
              <h2 className="font-heading text-base font-semibold">
                Overall conclusion
              </h2>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {result.overall_conclusion}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
