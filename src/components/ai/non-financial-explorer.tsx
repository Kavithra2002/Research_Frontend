"use client";

import * as React from "react";
import {
  AlertCircle,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  FileText,
  Globe2,
  Lightbulb,
  Loader2,
  Newspaper,
  PlayCircle,
  RefreshCw,
  Sparkles,
  StopCircle,
  TerminalSquare,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  CompanyPicker,
  type CompanyOption,
} from "@/components/ai/company-picker";
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
import { cn } from "@/lib/utils";

type CompanyReportRef = {
  source: "newly_uploaded_report" | "reports";
  reportType: string;
  fileName: string;
  fullPath: string;
  size: number;
  modifiedAt: string;
};

type CompanyEntry = {
  name: string;
  displayName: string;
  reports: CompanyReportRef[];
  latestModifiedAt: string | null;
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

export function NonFinancialExplorer() {
  const store = React.useSyncExternalStore(
    subscribeNonFinancialStore,
    getSnapshot,
    getServerSnapshot,
  );

  const [companies, setCompanies] = React.useState<CompanyEntry[]>([]);
  const [loadingCompanies, setLoadingCompanies] = React.useState(true);
  const [companiesError, setCompaniesError] = React.useState<string | null>(
    null,
  );

  const [selectedCompany, setSelectedCompany] = React.useState<string | null>(
    null,
  );
  const [selectedReportPath, setSelectedReportPath] = React.useState<
    string | null
  >(null);

  const [confirmingCancel, setConfirmingCancel] = React.useState(false);

  const logScrollRef = React.useRef<HTMLDivElement | null>(null);

  const loadCompanies = React.useCallback(async () => {
    setLoadingCompanies(true);
    setCompaniesError(null);
    try {
      const res = await fetch("/api/ai/non-financial/companies", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        companies?: CompanyEntry[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setCompanies(data.companies ?? []);
    } catch (err) {
      setCompaniesError(err instanceof Error ? err.message : String(err));
      setCompanies([]);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  React.useEffect(() => {
    if (!selectedCompany && companies.length > 0) {
      setSelectedCompany(companies[0].name);
    }
  }, [companies, selectedCompany]);

  // While a run is active, keep the picker in sync with the running company
  // so the UI reflects what is actually being analysed on the server.
  React.useEffect(() => {
    if (store.running && store.company) {
      setSelectedCompany(store.company);
    }
  }, [store.running, store.company]);

  // Close the confirmation popover the moment the run actually stops.
  React.useEffect(() => {
    if (!store.running) setConfirmingCancel(false);
  }, [store.running]);

  const company = React.useMemo(
    () => companies.find((c) => c.name === selectedCompany) ?? null,
    [companies, selectedCompany],
  );

  React.useEffect(() => {
    if (!company || company.reports.length === 0) {
      setSelectedReportPath(null);
      return;
    }
    setSelectedReportPath((prev) => {
      if (prev && company.reports.some((r) => r.fullPath === prev)) return prev;
      return company.reports[0].fullPath;
    });
  }, [company]);

  const companyOptions = React.useMemo<CompanyOption[]>(
    () =>
      companies.map((c) => ({
        name: c.name,
        displayName: c.displayName,
        statements: c.reports.map((r) => r.reportType),
        totalReports: c.reports.length,
        model: null,
      })),
    [companies],
  );

  // Only surface the store's run details if they belong to the currently
  // selected company. After a run finishes, switching the picker to a
  // different company should leave the old briefing behind and show the
  // empty state — not somebody else's analysis.
  const matchesSelected =
    !store.company || store.company === selectedCompany;
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

  const runAnalysis = React.useCallback(async () => {
    if (!selectedCompany) return;
    if (store.running) return;
    await storeRunAnalysis({
      company: selectedCompany,
      pdf: selectedReportPath ?? undefined,
    });
  }, [selectedCompany, selectedReportPath, store.running]);

  const handleConfirmCancel = React.useCallback(() => {
    setConfirmingCancel(false);
    void storeCancelAnalysis();
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-1.5 shadow-sm ring-1 ring-foreground/10 backdrop-blur supports-[backdrop-filter]:bg-card/95">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <CompanyPicker
            companies={companyOptions}
            selectedCompany={selectedCompany}
            onSelectCompany={(name) => {
              setSelectedCompany(name);
            }}
            loading={loadingCompanies}
            error={companiesError}
          />
          <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">
            {companies.length} total
          </Badge>
          {company ? (
            <Badge variant="secondary" className="hidden text-[10px] md:inline-flex">
              {company.reports.length} report
              {company.reports.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => loadCompanies()}
            disabled={loadingCompanies || running}
            aria-label="Refresh companies"
            title="Refresh companies"
          >
            {loadingCompanies ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
          </Button>
          {running ? (
            <Popover
              open={confirmingCancel}
              onOpenChange={setConfirmingCancel}
            >
              <PopoverTrigger
                render={
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                  >
                    <StopCircle className="size-4" />
                    Stop
                  </Button>
                }
              />
              <PopoverContent
                align="end"
                className="w-72"
              >
                <div className="text-sm font-medium">
                  Cancel the running analysis?
                </div>
                <div className="text-xs text-muted-foreground">
                  The current AI briefing will be discarded.
                </div>
                <div className="mt-1 flex items-center justify-end gap-2">
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
              disabled={!selectedCompany || loadingCompanies}
              className="gap-2"
            >
              <PlayCircle className="size-4" />
              Proceed the Non - financial data
            </Button>
          )}
        </div>
      </div>

      <Card size="sm" className="overflow-hidden">
        <CardContent className="flex min-w-0 flex-col gap-3 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="size-4" />
            <span className="truncate font-medium text-foreground">
              {company?.displayName ?? "Select a company"}
            </span>
            {company?.latestModifiedAt ? (
              <Badge variant="secondary" className="ml-auto text-[10px]">
                Latest report{" "}
                {new Date(company.latestModifiedAt).toLocaleDateString()}
              </Badge>
            ) : null}
          </div>

          {company && company.reports.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {company.reports.map((r) => {
                const isActive = r.fullPath === selectedReportPath;
                return (
                  <button
                    key={r.fullPath}
                    type="button"
                    onClick={() => setSelectedReportPath(r.fullPath)}
                    disabled={running}
                    className={cn(
                      "group flex min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-xs transition-colors",
                      "hover:bg-muted",
                      isActive
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground",
                      running && "cursor-not-allowed opacity-60",
                    )}
                    title={r.fullPath}
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{r.reportType}</span>
                    <span className="truncate text-[10px] opacity-70">
                      {r.fileName}
                    </span>
                    <span className="shrink-0 text-[10px] opacity-60">
                      {formatBytes(r.size)}
                    </span>
                    <span className="shrink-0 text-[10px] opacity-60">
                      {r.source === "newly_uploaded_report"
                        ? "new"
                        : "archive"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {loadingCompanies
                ? "Loading available reports…"
                : "No PDF reports were found for this company. Upload a report first or extract one from the CSE."}
            </p>
          )}
        </CardContent>
      </Card>

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
                    <span className="font-medium text-foreground">
                      {s.title}
                    </span>
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

      {!running && !result && logs.length === 0 ? (
        <Card size="sm">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Newspaper className="size-8 text-muted-foreground" />
            <h3 className="font-heading text-base font-medium">
              Generate the non-financial briefing
            </h3>
            <p className="max-w-xl text-sm text-muted-foreground">
              Pick a company above, choose which report you want to analyse,
              and click <strong>Proceed the Non - financial data</strong>. The
              script reads the annual report, keeps only company-specific
              business sections (About Us, financial highlights, MD&amp;A, risk
              management, statistical summary) — not chairman messages, board
              profiles or generic directory data — then asks OpenAI for a
              focused briefing and real-world scenario analysis.
            </p>
          </CardContent>
        </Card>
      ) : null}
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
