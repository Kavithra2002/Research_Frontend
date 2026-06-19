"use client";

import * as React from "react";
import {
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type MacChartFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

type MacChartYear = {
  year: string;
  files: MacChartFile[];
};

type ApiResponse = {
  years?: MacChartYear[];
  totalReports?: number;
  error?: string;
};

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

function displayTitle(filename: string) {
  return filename.replace(/\.pdf$/i, "");
}

function buildFileUrl(year: string, file: string, download = false) {
  const params = new URLSearchParams({ year, file });
  if (download) params.set("download", "1");
  return `/api/macroeconomics/charts/file?${params.toString()}`;
}

function formatRunResult(saved: number, failed: number): string {
  if (failed > 0 && saved === 0) {
    return `Check failed — ${failed} report${failed === 1 ? "" : "s"} could not be downloaded.`;
  }
  if (saved === 0) return "No reports have uploaded";
  return saved === 1 ? "1 report downloaded" : `${saved} reports downloaded`;
}

export function MacroeconomicsChartsExplorer() {
  const [years, setYears] = React.useState<MacChartYear[]>([]);
  const [totalReports, setTotalReports] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedYear, setSelectedYear] = React.useState<string | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  const [viewerFullscreen, setViewerFullscreen] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [runProgress, setRunProgress] = React.useState<{
    current: number;
    total: number;
  } | null>(null);
  const [runPhase, setRunPhase] = React.useState<"fetching" | "checking" | null>(
    null,
  );
  const [runMessage, setRunMessage] = React.useState<string | null>(null);
  const [runResult, setRunResult] = React.useState<"success" | "error" | null>(
    null,
  );
  const abortRef = React.useRef<AbortController | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/macroeconomics/charts/list", { cache: "no-store" });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setYears(data.years ?? []);
      setTotalReports(data.totalReports ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setYears([]);
      setTotalReports(0);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (!selectedYear && years.length > 0) {
      setSelectedYear(years[0].year);
    }
  }, [years, selectedYear]);

  const yearGroup = React.useMemo(
    () => years.find((y) => y.year === selectedYear) ?? null,
    [years, selectedYear],
  );

  React.useEffect(() => {
    if (!yearGroup) {
      setSelectedFile(null);
      return;
    }
    if (
      !selectedFile ||
      !yearGroup.files.some((f) => f.name === selectedFile)
    ) {
      setSelectedFile(yearGroup.files[0]?.name ?? null);
    }
  }, [yearGroup, selectedFile]);

  React.useEffect(() => {
    if (!selectedFile && viewerFullscreen) {
      setViewerFullscreen(false);
    }
  }, [selectedFile, viewerFullscreen]);

  React.useEffect(() => {
    if (!viewerFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewerFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerFullscreen]);

  const currentFileUrl = React.useMemo(() => {
    if (!selectedYear || !selectedFile) return null;
    return buildFileUrl(selectedYear, selectedFile);
  }, [selectedYear, selectedFile]);

  const handleRunEvent = React.useCallback((line: string) => {
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = String(evt.type ?? "");
    switch (type) {
      case "phase":
        if (evt.phase === "fetching") {
          setRunPhase("fetching");
          setRunProgress(null);
        }
        break;
      case "start":
        setRunPhase("checking");
        setRunProgress({
          current: 0,
          total: Number(evt.total ?? 0),
        });
        break;
      case "progress":
        setRunPhase("checking");
        setRunProgress({
          current: Number(evt.current ?? 0),
          total: Number(evt.total ?? 0),
        });
        break;
      case "done": {
        const saved = Number(evt.saved ?? 0);
        const failed = Number(evt.failed ?? 0);
        const exists = Number(evt.exists ?? 0);
        const total = saved + exists + failed;
        setRunProgress({
          current: total,
          total: Math.max(total, 1),
        });
        const message = formatRunResult(saved, failed);
        setRunMessage(message);
        setRunResult(failed > 0 && saved === 0 ? "error" : "success");
        break;
      }
      case "error":
        setRunMessage(String(evt.message ?? "Sync failed"));
        setRunResult("error");
        break;
      default:
        break;
    }
  }, []);

  const handleRun = React.useCallback(async () => {
    if (running) return;

    setRunning(true);
    setRunProgress(null);
    setRunPhase("fetching");
    setRunMessage(null);
    setRunResult(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/macroeconomics/charts/run", {
        method: "POST",
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
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handleRunEvent(line);
          nl = buf.indexOf("\n");
        }
      }
      if (buf.trim()) handleRunEvent(buf.trim());

      await load();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setRunMessage(e instanceof Error ? e.message : String(e));
        setRunResult("error");
      }
    } finally {
      setRunning(false);
      setRunPhase(null);
      abortRef.current = null;
    }
  }, [handleRunEvent, load, running]);

  const hasTotal = !!runProgress && runProgress.total > 0;
  const progressPct = hasTotal
    ? Math.min(100, Math.round((runProgress.current / runProgress.total) * 100))
    : 0;
  const indeterminate = running && runPhase === "fetching";
  const runningStatusText =
    runPhase === "fetching"
      ? "Checking CBSL source for available reports..."
      : hasTotal
        ? `Checking reports ${runProgress?.current ?? 0} of ${runProgress?.total ?? 0}...`
        : "Checking for new reports...";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {!viewerFullscreen && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-1.5 shadow-sm ring-1 ring-foreground/10 backdrop-blur supports-[backdrop-filter]:bg-card/95">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {totalReports} report{totalReports === 1 ? "" : "s"}
            </Badge>
            <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
              Central Bank of Sri Lanka — Macroeconomic Developments in Charts
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => load()}
              disabled={loading || running}
              aria-label="Refresh"
              title="Refresh"
            >
              {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            </Button>
            <Button
              size="sm"
              onClick={() => handleRun()}
              disabled={running || loading}
              className="relative min-w-[120px] overflow-hidden"
              title="Check CBSL for new reports and download any missing files"
            >
              {running ? (
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 bg-primary-foreground/35 transition-[width] duration-500 ease-out",
                    indeterminate && "w-2/5 animate-demo-indeterminate",
                  )}
                  style={
                    !indeterminate ? { width: `${progressPct}%` } : undefined
                  }
                />
              ) : null}
              <span className="relative z-10 flex items-center gap-1.5">
                {running ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                Sync Reports
              </span>
            </Button>
          </div>
        </div>
      )}

      {!viewerFullscreen && (running || runMessage) ? (
        <div
          className={cn(
            "rounded-xl border px-3 py-2.5 shadow-sm",
            running
              ? "border-border bg-card"
              : runResult === "error"
                ? "border-destructive/30 bg-destructive/5"
                : "border-emerald-500/30 bg-emerald-500/5",
          )}
        >
          {running ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
                <span>{runningStatusText}</span>
                {hasTotal ? (
                  <span className="ml-auto tabular-nums">{progressPct}%</span>
                ) : null}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                {indeterminate ? (
                  <div className="animate-demo-indeterminate h-full w-2/5 rounded-full bg-primary" />
                ) : (
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.max(progressPct, 4)}%` }}
                  />
                )}
              </div>
            </div>
          ) : runMessage ? (
            <div className="flex items-center gap-2 text-sm">
              {runResult === "error" ? (
                <FileText className="size-4 shrink-0 text-destructive" />
              ) : (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              )}
              <span
                className={cn(
                  "font-medium",
                  runResult === "error"
                    ? "text-destructive"
                    : "text-foreground",
                )}
              >
                {runMessage}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <Card className="flex h-full min-h-0 flex-1 flex-col py-0" size="sm">
        {loading && years.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading macroeconomics charts...
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center p-10 text-sm text-destructive">
            {error}
          </div>
        ) : years.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-10 text-center">
            <div className="max-w-sm">
              <FileText className="mx-auto size-8 text-muted-foreground" />
              <h3 className="mt-3 font-heading text-base font-medium">
                No charts available
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Press <span className="font-medium">Sync Reports</span> to check the CBSL
                source and download any new reports.
              </p>
            </div>
          </div>
        ) : (
          <CardContent
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-3",
              viewerFullscreen ? "p-0" : "py-3",
              !viewerFullscreen && "lg:flex-row",
            )}
          >
            {!viewerFullscreen && (
              <Card
                size="sm"
                className="flex h-full min-h-0 w-full flex-col py-0 lg:max-w-sm"
              >
                <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                  Reports by year
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <div className="flex flex-col gap-3 p-2">
                    {years.map((group) => {
                      const yearActive = group.year === selectedYear;
                      return (
                        <div key={group.year} className="flex flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedYear(group.year);
                              setSelectedFile(null);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-colors",
                              "hover:bg-muted",
                              yearActive && "bg-muted",
                            )}
                          >
                            <Calendar className="size-4 shrink-0 text-muted-foreground" />
                            <span>{group.year}</span>
                            <Badge
                              variant={yearActive ? "default" : "secondary"}
                              className="ml-auto text-[10px]"
                            >
                              {group.files.length}
                            </Badge>
                          </button>
                          {yearActive ? (
                            <ul className="flex flex-col gap-1 pl-1">
                              {group.files.map((file) => {
                                const isActive = selectedFile === file.name;
                                return (
                                  <li key={file.name}>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedFile(file.name)}
                                      className={cn(
                                        "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                                        "hover:bg-muted",
                                        isActive && "bg-muted text-foreground",
                                      )}
                                    >
                                      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                      <div className="min-w-0 flex-1">
                                        <div
                                          className="line-clamp-2 text-sm leading-snug"
                                          title={displayTitle(file.name)}
                                        >
                                          {displayTitle(file.name)}
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                          <span>{formatBytes(file.size)}</span>
                                          <span aria-hidden="true">·</span>
                                          <span>
                                            {formatDate(file.modifiedAt)}
                                          </span>
                                        </div>
                                      </div>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </Card>
            )}

            <div
              className={cn(
                "flex h-full min-h-0 flex-1 flex-col overflow-hidden border bg-muted/30",
                viewerFullscreen ? "rounded-none" : "rounded-xl",
              )}
            >
              {selectedFile && currentFileUrl ? (
                <>
                  <div className="flex items-center justify-between gap-2 border-b bg-card px-3 py-2">
                    <div className="min-w-0">
                      <div
                        className="line-clamp-2 text-sm font-medium"
                        title={displayTitle(selectedFile)}
                      >
                        {displayTitle(selectedFile)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {selectedYear}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant={viewerFullscreen ? "default" : "ghost"}
                        size="icon-sm"
                        onClick={() => setViewerFullscreen((v) => !v)}
                        aria-label={
                          viewerFullscreen
                            ? "Exit fullscreen"
                            : "View fullscreen"
                        }
                        title={
                          viewerFullscreen
                            ? "Exit fullscreen (Esc)"
                            : "View fullscreen"
                        }
                      >
                        {viewerFullscreen ? <Minimize2 /> : <Maximize2 />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Open in new tab"
                        title="Open in new tab"
                        nativeButton={false}
                        render={
                          <a
                            href={currentFileUrl}
                            target="_blank"
                            rel="noreferrer"
                          />
                        }
                      >
                        <ExternalLink />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Download"
                        title="Download"
                        nativeButton={false}
                        render={
                          <a href={currentFileUrl + "&download=1"} />
                        }
                      >
                        <Download />
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  <div className="min-h-0 flex-1">
                    <object
                      data={currentFileUrl}
                      type="application/pdf"
                      className="block h-full w-full bg-background"
                    >
                      <iframe
                        src={currentFileUrl}
                        title={selectedFile}
                        className="h-full w-full"
                      />
                    </object>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-1 items-center justify-center p-10 text-center">
                  <div className="max-w-sm">
                    <FileText className="mx-auto size-8 text-muted-foreground" />
                    <h3 className="mt-3 font-heading text-base font-medium">
                      Select a chart report
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Choose a year and report from the list to preview it here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
