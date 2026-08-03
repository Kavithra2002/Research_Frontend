"use client";

import * as React from "react";
import {
  CheckCircle2,
  Loader2,
  Play,
  Square,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { COMMERCIAL_BANK_SLUG } from "@/lib/newspaper-db";

type YearOption = {
  year: number;
  hasAnnual: boolean;
  hasQuarterly: boolean;
};

type RunProgress = {
  done: number;
  total: number;
  label: string | null;
  active: boolean;
};

type RunSummary = {
  cellsFilled: number;
  cellsMissing: number;
  ok: boolean;
};

type DbCaptureRunDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  years: YearOption[];
  loadingYears?: boolean;
  onComplete?: () => void;
};

function progressPct(progress: RunProgress | null): number {
  if (!progress || progress.total <= 0) return 0;
  const base = progress.done / progress.total;
  const bump = progress.active ? 0.5 / progress.total : 0;
  return Math.min(100, Math.round((base + bump) * 100));
}

export function DbCaptureRunDialog({
  open,
  onOpenChange,
  years,
  loadingYears = false,
  onComplete,
}: DbCaptureRunDialogProps) {
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<RunProgress | null>(null);
  const [log, setLog] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<RunSummary | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setSummary(null);
    setLog([]);
    setProgress(null);
  }, [open]);

  React.useEffect(() => {
    if (!open || years.length === 0) return;
    setSelected((prev) =>
      prev.size > 0 ? prev : new Set([years[0]!.year]),
    );
  }, [open, years]);

  const toggleYear = (year: number) => {
    if (running) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const appendLog = React.useCallback((msg: string) => {
    const stamp = new Date().toLocaleTimeString();
    setLog((prev) => [`${stamp}  ${msg}`, ...prev].slice(0, 200));
  }, []);

  const handleCancel = () => {
    abortRef.current?.abort();
    void fetch("/api/db/run", { method: "DELETE" }).catch(() => {});
    setRunning(false);
    setProgress((p) => (p ? { ...p, active: false } : null));
    appendLog("Run cancelled.");
  };

  const handleRun = async () => {
    const yearList = [...selected].sort((a, b) => b - a);
    if (yearList.length === 0) return;

    setRunning(true);
    setError(null);
    setSummary(null);
    setLog([]);
    setProgress(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/db/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ years: yearList }),
        signal: ctrl.signal,
        cache: "no-store",
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl = buf.indexOf("\n");
        while (nl !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) {
            nl = buf.indexOf("\n");
            continue;
          }
          try {
            const evt = JSON.parse(line) as Record<string, unknown>;
            const type = String(evt.type ?? "");
            switch (type) {
              case "start":
                setProgress({
                  done: 0,
                  total: Number(evt.totalSteps ?? 0),
                  label: null,
                  active: false,
                });
                appendLog(
                  `Starting capture for ${(evt.years as number[])?.join(", ") ?? yearList.join(", ")}…`,
                );
                break;
              case "stage-start":
                setProgress({
                  done: Number(evt.done ?? 0),
                  total: Number(evt.totalSteps ?? 0),
                  label: String(evt.label ?? ""),
                  active: true,
                });
                break;
              case "stage-done":
                setProgress({
                  done: Number(evt.done ?? 0),
                  total: Number(evt.totalSteps ?? 0),
                  label: String(evt.label ?? ""),
                  active: false,
                });
                break;
              case "log":
                appendLog(String(evt.message ?? ""));
                break;
              case "error":
                setError(String(evt.message ?? "Unknown error"));
                appendLog(`ERROR: ${evt.message ?? ""}`);
                break;
              case "done":
                setSummary({
                  cellsFilled: Number(evt.cells_filled ?? 0),
                  cellsMissing: Number(evt.cells_missing ?? 0),
                  ok: Number(evt.failed ?? 0) === 0,
                });
                setProgress((p) =>
                  p ? { ...p, done: p.total, active: false } : p,
                );
                appendLog(
                  `Done — ${evt.cells_filled ?? 0} filled, ${evt.cells_missing ?? 0} missing.`,
                );
                onComplete?.();
                break;
              case "exit":
                setRunning(false);
                break;
              default:
                break;
            }
          } catch {
            /* ignore malformed lines */
          }
          nl = buf.indexOf("\n");
        }
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      appendLog(`ERROR: ${msg}`);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const pct = progressPct(progress);
  const canRun = selected.size > 0 && !running && !loadingYears;

  return (
    <Dialog open={open} onOpenChange={(next) => !running && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md" showCloseButton={!running}>
        <DialogHeader>
          <DialogTitle>Run DB capture</DialogTitle>
          <DialogDescription>
            Commercial Bank of Ceylon — select year(s) to capture FS, Drivers,
            Ratios, and Quarterly data into the DB workbook store.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loadingYears ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading available years…
            </div>
          ) : years.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No extracted years found for Commercial Bank. Upload annual reports
              first via Test here.
            </p>
          ) : (
            <div className="rounded-lg border bg-muted/30 p-2">
              <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
                Available years
              </p>
              <div className="flex flex-wrap gap-2">
                {years.map((y) => {
                  const checked = selected.has(y.year);
                  return (
                    <label
                      key={y.year}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm transition-colors",
                        checked
                          ? "border-lime-500/50 bg-lime-500/10"
                          : "border-transparent bg-background hover:bg-muted/50",
                        running && "pointer-events-none opacity-60",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleYear(y.year)}
                        disabled={running}
                      />
                      <span className="font-medium tabular-nums">{y.year}</span>
                      <span className="flex gap-1">
                        {y.hasAnnual ? (
                          <Badge variant="outline" className="h-5 px-1 text-[10px]">
                            A
                          </Badge>
                        ) : null}
                        {y.hasQuarterly ? (
                          <Badge variant="outline" className="h-5 px-1 text-[10px]">
                            Q
                          </Badge>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {(running || progress || summary) && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium">
                  {summary ? (
                    <span className="inline-flex items-center gap-1 text-lime-600 dark:text-lime-400">
                      <CheckCircle2 className="size-3.5" />
                      Capture complete
                    </span>
                  ) : running ? (
                    "Capturing…"
                  ) : (
                    "Progress"
                  )}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {progress && progress.total > 0
                    ? `${progress.done}/${progress.total} · ${pct}%`
                    : "…"}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                {progress && progress.total > 0 ? (
                  <div
                    className="h-full rounded-full bg-lime-500 transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                ) : (
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-lime-500/70" />
                )}
              </div>
              {progress?.label ? (
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={progress.label}
                >
                  {progress.label}
                </p>
              ) : null}
              {summary ? (
                <p className="text-xs text-muted-foreground">
                  {summary.cellsFilled.toLocaleString()} values filled ·{" "}
                  {summary.cellsMissing.toLocaleString()} missing
                </p>
              ) : null}
            </div>
          )}

          {log.length > 0 ? (
            <ScrollArea className="h-28 rounded-md border bg-muted/20 p-2">
              <div className="space-y-0.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {log.map((line, i) => (
                  <div key={`${i}-${line.slice(0, 24)}`}>{line}</div>
                ))}
              </div>
            </ScrollArea>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {running ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleCancel}
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!canRun}
            onClick={() => void handleRun()}
          >
            {running ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type DbCaptureRunButtonProps = {
  onCaptureComplete?: () => void;
  className?: string;
};

export function DbCaptureRunButton({
  onCaptureComplete,
  className,
}: DbCaptureRunButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [years, setYears] = React.useState<YearOption[]>([]);
  const [loadingYears, setLoadingYears] = React.useState(false);

  const loadYears = React.useCallback(async () => {
    setLoadingYears(true);
    try {
      const res = await fetch("/api/extracted", { cache: "no-store" });
      const json = (await res.json()) as {
        companies?: {
          name: string;
          years?: {
            year: number;
            annual?: unknown;
            quarterly?: unknown;
          }[];
        }[];
      };
      const comb = json.companies?.find((c) => c.name === COMMERCIAL_BANK_SLUG);
      const list =
        comb?.years
          ?.map((y) => ({
            year: y.year,
            hasAnnual: Boolean(y.annual),
            hasQuarterly: Boolean(y.quarterly),
          }))
          .sort((a, b) => b.year - a.year) ?? [];
      setYears(list);
    } catch {
      setYears([]);
    } finally {
      setLoadingYears(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) void loadYears();
  }, [open, loadYears]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        className={cn("shrink-0", className)}
        title="Run DB capture (developer test)"
        onClick={() => setOpen(true)}
      >
        <Play className="size-3.5" />
        <span className="sr-only">Run</span>
      </Button>
      <DbCaptureRunDialog
        open={open}
        onOpenChange={setOpen}
        years={years}
        loadingYears={loadingYears}
        onComplete={onCaptureComplete}
      />
    </>
  );
}
