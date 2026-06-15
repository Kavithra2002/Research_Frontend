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
  Play,
  RefreshCw,
  Square,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

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

type SelectedItem = {
  company: string;
  report_type: "Annual" | "Quarterly";
  file_name: string;
  rel_path: string;
  group: string;
};

type NfMetric = {
  key: string;
  title: string;
  found: boolean;
  value: string;
  detail: string;
  pages: number[];
};
type NfCategory = { key: string; title: string; metrics: NfMetric[] };
type NfResult = {
  company: string;
  group: string;
  reporting_year: string | null;
  company_overview: string;
  categories: NfCategory[];
  found_count: number;
  total_count: number;
};

type DbUpload = {
  company: string;
  status: string;
  categories: number;
  metrics: number;
  found: number;
  total: number;
  year: number | null;
  error?: string | null;
};

type Summary = { ok: number; failed: number; uploaded: boolean };

export function NonFinancialRunnerPanel() {
  const [companies, setCompanies] = React.useState<DemoCompany[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<Map<string, SelectedItem>>(
    new Map(),
  );

  const [running, setRunning] = React.useState(false);
  const [log, setLog] = React.useState<string[]>([]);
  const [uploads, setUploads] = React.useState<DbUpload[]>([]);
  const [results, setResults] = React.useState<NfResult[]>([]);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [progress, setProgress] = React.useState<{
    done: number;
    total: number;
  } | null>(null);
  const [activeStage, setActiveStage] = React.useState(false);
  const [stageMsg, setStageMsg] = React.useState<string | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

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
    (
      company: string,
      period: "Annual" | "Quarterly",
      group: string,
      file: DemoFile,
    ) => {
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

  const clearSelection = React.useCallback(() => setSelected(new Map()), []);
  const selectedCount = selected.size;

  const pushLog = React.useCallback((msg: string) => {
    const stamp = new Date().toLocaleTimeString();
    setLog((p) => [`${stamp}  ${msg}`, ...p].slice(0, 500));
  }, []);

  const handleEvent = React.useCallback(
    (line: string) => {
      let evt: Record<string, unknown>;
      try {
        evt = JSON.parse(line) as Record<string, unknown>;
      } catch {
        pushLog(line);
        return;
      }
      const type = String(evt.type ?? "");
      switch (type) {
        case "start":
          setProgress({
            done: 0,
            total: Number(evt.totalFiles ?? evt.totalReports ?? 0),
          });
          setActiveStage(false);
          pushLog(
            `Starting: ${evt.totalReports ?? evt.totalFiles} report(s) across ${evt.totalCompanies} compan(ies) · ${evt.model}`,
          );
          break;
        case "company-start":
          pushLog(
            `Processing ${evt.company} (${evt.reportCount ?? 0} report(s))…`,
          );
          break;
        case "stage-start":
          setActiveStage(true);
          setStageMsg(`${evt.company} · ${evt.group || evt.fileName}…`);
          pushLog(`  ${evt.company} · ${evt.group || evt.fileName}: reading…`);
          break;
        case "progress":
          if (evt.stage === "openai_call") {
            setStageMsg(String(evt.message ?? "Calling OpenAI…"));
          } else if (evt.stage === "extract_text") {
            setStageMsg(String(evt.message ?? "Extracting text…"));
          }
          break;
        case "stage-done":
          setActiveStage(false);
          setProgress((prev) =>
            prev ? { ...prev, done: Math.min(prev.total, prev.done + 1) } : prev,
          );
          pushLog(
            `  ${evt.company} · ${evt.group || ""}: ${evt.status} — ${evt.found ?? 0}/${evt.total ?? 0} data points`,
          );
          break;
        case "db-upload": {
          setUploads((p) => [
            {
              company: String(evt.company ?? ""),
              status: String(evt.status ?? ""),
              categories: Number(evt.categories ?? 0),
              metrics: Number(evt.metrics ?? 0),
              found: Number(evt.found ?? 0),
              total: Number(evt.total ?? 0),
              year: (evt.year as number) ?? null,
              error: (evt.error as string) ?? null,
            },
            ...p,
          ]);
          pushLog(
            `  DB upload (${evt.company}): ${evt.status} — ${evt.metrics ?? 0} metric(s)`,
          );
          break;
        }
        case "result": {
          const data = evt.data as Record<string, unknown> | undefined;
          if (data) {
            const company = String(data.company ?? evt.company ?? "");
            const group = String(evt.group ?? "");
            const next: NfResult = {
              company,
              group,
              reporting_year: (data.reporting_year as string) ?? null,
              company_overview: String(data.company_overview ?? ""),
              categories: (data.categories as NfCategory[]) ?? [],
              found_count: Number(data.found_count ?? 0),
              total_count: Number(data.total_count ?? 0),
            };
            // Key by company + report group/year so each year stays separate.
            setResults((p) => [
              next,
              ...p.filter(
                (r) => !(r.company === company && r.group === group),
              ),
            ]);
          }
          break;
        }
        case "company-done":
          break;
        case "log":
          pushLog(String(evt.message ?? ""));
          break;
        case "error":
          setRunError(String(evt.message ?? "Unknown error"));
          pushLog(`ERROR: ${evt.message ?? ""}`);
          break;
        case "done":
          setSummary({
            ok: Number(evt.ok ?? 0),
            failed: Number(evt.failed ?? 0),
            uploaded: Boolean(evt.uploaded),
          });
          setActiveStage(false);
          setStageMsg(null);
          setProgress((prev) => (prev ? { ...prev, done: prev.total } : prev));
          pushLog(`Done — ${evt.ok} ok, ${evt.failed} failed.`);
          break;
        default:
          break;
      }
    },
    [pushLog],
  );

  const handleRun = React.useCallback(async () => {
    if (selectedCount === 0 || running) return;
    setRunning(true);
    setLog([]);
    setUploads([]);
    setResults([]);
    setSummary(null);
    setProgress(null);
    setActiveStage(false);
    setStageMsg(null);
    setRunError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const items = Array.from(selected.values());

    try {
      const res = await fetch("/api/demo/run-non-financial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl = buf.indexOf("\n");
        while (nl !== -1) {
          const ln = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (ln) handleEvent(ln);
          nl = buf.indexOf("\n");
        }
      }
      if (buf.trim()) handleEvent(buf.trim());
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setRunError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [selected, selectedCount, running, handleEvent]);

  const handleCancel = React.useCallback(() => {
    abortRef.current?.abort();
    fetch("/api/demo/run-non-financial", { method: "DELETE" }).catch(() => {});
    setRunning(false);
  }, []);

  const totalMetrics = uploads.reduce((n, u) => n + u.metrics, 0);
  const hasTotal = !!progress && progress.total > 0;
  const displayDone = progress
    ? Math.min(progress.total, progress.done + (activeStage ? 0.6 : 0))
    : 0;
  const progressPct = hasTotal
    ? Math.min(100, Math.round((displayDone / progress!.total) * 100))
    : 0;
  const indeterminate =
    running && (!hasTotal || (displayDone === 0 && !activeStage));

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Leaf className="size-4 text-emerald-600 dark:text-emerald-400" />
                Non-financial data — capture &amp; save to DB
              </CardTitle>
              <CardDescription className="mt-1">
                Pick an annual report, then run the non-financial extraction. The
                pipeline reads the PDF, asks OpenAI to capture the standard
                non-financial data points (workforce, network, ESG, governance,
                materiality, …) and saves them to MongoDB{" "}
                <span className="font-medium">company-wise</span> in the{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  non_financial_data
                </code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  non_financial_metrics
                </code>{" "}
                collections.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => load()}
                disabled={loading || running}
              >
                {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Refresh
              </Button>
              {selectedCount > 0 && !running && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearSelection}
                  className="text-[12px]"
                >
                  Clear ({selectedCount})
                </Button>
              )}
              {running ? (
                <Button variant="destructive" size="sm" onClick={handleCancel}>
                  <Square />
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleRun}
                  disabled={selectedCount === 0}
                  title={
                    selectedCount === 0
                      ? "Select at least one report"
                      : undefined
                  }
                >
                  <Play />
                  Run non-financial extraction
                  {selectedCount > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {selectedCount}
                    </Badge>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {(running ||
          summary ||
          runError ||
          uploads.length > 0 ||
          log.length > 0) && (
          <CardContent className="flex flex-col gap-3">
            {running && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-3.5 animate-spin" />
                    {stageMsg ??
                      (hasTotal
                        ? `Processing ${Math.min(
                            progress!.done + (activeStage ? 1 : 0),
                            progress!.total,
                          )}/${progress!.total}`
                        : "Starting…")}
                  </span>
                  <span>
                    {hasTotal ? `${progressPct}% · ` : ""}
                    {totalMetrics} metric(s) saved
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
            )}

            {summary && !running && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span className="font-medium">Run complete.</span>
                <span className="text-muted-foreground">
                  {summary.ok} ok, {summary.failed} failed · {totalMetrics}{" "}
                  metric(s) saved to MongoDB.
                </span>
              </div>
            )}

            {runError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{runError}</span>
              </div>
            )}

            {uploads.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 px-3 py-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Database uploads
                </span>
                {uploads.map((u, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {u.status === "ok" ? (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="size-3.5 text-amber-500" />
                    )}
                    <span className="truncate font-medium" title={u.company}>
                      {u.company}
                    </span>
                    {u.year ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {u.year}
                      </Badge>
                    ) : null}
                    <span className="ml-auto text-muted-foreground">
                      {u.found}/{u.total} found · {u.metrics} saved
                    </span>
                    {u.error ? (
                      <span
                        className="truncate text-destructive"
                        title={u.error}
                      >
                        {u.error}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {results.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Extracted data
                </span>
                {results.map((r) => (
                  <ResultCard key={`${r.company}::${r.group}`} result={r} />
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
                <ScrollArea className="h-48">
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
      </Card>

      <Card size="sm" className="flex max-h-[420px] min-h-0 flex-col py-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <span className="font-heading text-sm font-medium">
              Select report(s)
            </span>
            <Badge variant="secondary" className="ml-1">
              {companies.length} compan{companies.length === 1 ? "y" : "ies"}
            </Badge>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {error ? (
            <div className="flex flex-1 items-center justify-center p-10">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          ) : loading && companies.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading reports…
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center">
              <div className="max-w-sm">
                <FileText className="mx-auto size-8 text-muted-foreground" />
                <h3 className="mt-3 font-heading text-base font-medium">
                  No reports found
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add PDFs under{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                    backend/Demo_Data/&lt;Company&gt;/Annual/
                  </code>
                  .
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <ul className="divide-y">
                {companies.map((c) => (
                  <CompanyRow
                    key={c.name}
                    company={c}
                    selected={selected}
                    onToggleFile={toggleFile}
                    disabled={running}
                  />
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      </Card>
    </div>
  );
}

function ResultCard({ result }: { result: NfResult }) {
  const [open, setOpen] = React.useState(false);
  const foundCats = result.categories.filter((c) =>
    c.metrics.some((m) => m.found),
  );
  return (
    <div className="rounded-lg border bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/30"
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{result.company}</span>
        {result.reporting_year || result.group ? (
          <Badge variant="secondary" className="text-[10px]">
            {result.reporting_year ?? result.group}
          </Badge>
        ) : null}
        {result.group && result.reporting_year ? (
          <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">
            {result.group}
          </span>
        ) : null}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {result.found_count}/{result.total_count} data points
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t px-3 py-3">
          {result.company_overview ? (
            <p className="text-xs text-muted-foreground">
              {result.company_overview}
            </p>
          ) : null}
          {foundCats.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No non-financial data points were captured from this report.
            </p>
          ) : (
            foundCats.map((cat) => (
              <div key={cat.key} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {cat.title}
                </span>
                <ul className="flex flex-col gap-1">
                  {cat.metrics
                    .filter((m) => m.found)
                    .map((m) => (
                      <li
                        key={m.key}
                        className="rounded-md border bg-background px-2 py-1.5 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{m.title}</span>
                          {m.pages.length > 0 ? (
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              p.{m.pages.join(", ")}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-muted-foreground">
                          {m.value}
                        </div>
                        {m.detail ? (
                          <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                            {m.detail}
                          </div>
                        ) : null}
                      </li>
                    ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CompanyRow({
  company,
  selected,
  onToggleFile,
  disabled,
}: {
  company: DemoCompany;
  selected: Map<string, SelectedItem>;
  onToggleFile: (
    c: string,
    p: "Annual" | "Quarterly",
    g: string,
    f: DemoFile,
  ) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  const annualFiles = company.annual.flatMap((g) =>
    g.files.map((f) => ({ group: g.group, file: f })),
  );
  const selCount = annualFiles.filter((x) =>
    selected.has(x.file.relPath),
  ).length;

  return (
    <li className="px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted/50"
        disabled={annualFiles.length === 0}
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
          {selCount}/{annualFiles.length} annual
        </Badge>
      </button>

      {open && annualFiles.length > 0 && (
        <div className="mt-1 ml-6 flex flex-col rounded-lg border bg-muted/10">
          <div className="flex items-center gap-2 border-b px-3 py-1.5">
            <span className="rounded bg-blue-500/15 px-1.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
              Annual
            </span>
            <Separator orientation="vertical" className="h-3" />
            <span className="text-[11px] text-muted-foreground">
              {annualFiles.length} file(s)
            </span>
          </div>
          <ul className="flex flex-col">
            {annualFiles.map(({ group, file }) => {
              const sel = selected.has(file.relPath);
              return (
                <li
                  key={file.relPath}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5",
                    "hover:bg-muted/40",
                    sel && "bg-primary/5",
                  )}
                >
                  <Checkbox
                    checked={sel}
                    onCheckedChange={() =>
                      onToggleFile(company.name, "Annual", group, file)
                    }
                    disabled={disabled}
                    aria-label={`Select ${file.name}`}
                  />
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span
                    className="min-w-0 flex-1 truncate text-xs"
                    title={file.name}
                  >
                    {file.name}
                  </span>
                  {group ? (
                    <span className="truncate text-[10px] text-muted-foreground">
                      {group}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}
