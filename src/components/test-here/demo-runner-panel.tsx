"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Database,
  FileText,
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

export function DemoRunnerPanel() {
  const [companies, setCompanies] = React.useState<DemoCompany[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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

  const handleRun = React.useCallback(async () => {
    if (selectedCount === 0 || running) return;
    await runDemo(Array.from(selected.values()));
  }, [selected, selectedCount, running]);

  const handleCancel = React.useCallback(() => {
    void cancelDemoRun();
  }, []);

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
                Pick annual and/or quarterly reports from{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  Demo_Data/
                </code>
                , then run the extraction pipeline. Each report&apos;s tables are
                pushed into MongoDB right after extraction, organised as{" "}
                <span className="font-medium">Company → Year → Annual/Quarterly → tables</span>.
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
                  Run
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

        {(running || summary || runError || uploads.length > 0 || log.length > 0) && (
          <CardContent className="flex flex-col gap-3">
            {running && (
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
            )}

            {summary && !running && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span className="font-medium">Run complete.</span>
                <span className="text-muted-foreground">
                  {summary.ok} ok, {summary.failed} failed ·{" "}
                  {totalUploadedTables} table(s) saved to MongoDB.
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
      </Card>

      <Card size="sm" className="flex max-h-[460px] min-h-0 flex-col py-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <span className="font-heading text-sm font-medium">
              Demo reports
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
              Loading demo reports...
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center">
              <div className="max-w-sm">
                <FileText className="mx-auto size-8 text-muted-foreground" />
                <h3 className="mt-3 font-heading text-base font-medium">
                  No demo reports found
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add PDFs under{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                    backend/Demo_Data/&lt;Company&gt;/Annual|Quarterly/
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
                    onToggleGroup={toggleGroup}
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

function CompanyRow({
  company,
  selected,
  onToggleFile,
  onToggleGroup,
  disabled,
}: {
  company: DemoCompany;
  selected: Map<string, SelectedItem>;
  onToggleFile: (c: string, p: Period, g: string, f: DemoFile) => void;
  onToggleGroup: (c: string, p: Period, g: DemoGroup) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  const companyFiles = [
    ...company.annual.flatMap((g) => g.files),
    ...company.quarterly.flatMap((g) => g.files),
  ];
  const selCount = companyFiles.filter((f) => selected.has(f.relPath)).length;

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
          {selCount}/{company.totalFiles}
        </Badge>
      </button>

      {open && (
        <div className="mt-1 ml-6 flex flex-col gap-3 pb-2">
          <PeriodSection
            label="Annual"
            period="Annual"
            company={company.name}
            groups={company.annual}
            selected={selected}
            onToggleFile={onToggleFile}
            onToggleGroup={onToggleGroup}
            disabled={disabled}
          />
          <PeriodSection
            label="Quarterly"
            period="Quarterly"
            company={company.name}
            groups={company.quarterly}
            selected={selected}
            onToggleFile={onToggleFile}
            onToggleGroup={onToggleGroup}
            disabled={disabled}
          />
        </div>
      )}
    </li>
  );
}

function PeriodSection({
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
  period: Period;
  company: string;
  groups: DemoGroup[];
  selected: Map<string, SelectedItem>;
  onToggleFile: (c: string, p: Period, g: string, f: DemoFile) => void;
  onToggleGroup: (c: string, p: Period, g: DemoGroup) => void;
  disabled: boolean;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="rounded-lg border bg-muted/10">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span
          className={cn(
            "rounded px-1.5 text-[10px] font-semibold",
            period === "Quarterly"
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-blue-500/15 text-blue-600 dark:text-blue-400",
          )}
        >
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
                {grp.files.map((f) => {
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
                          onToggleFile(company, period, grp.group, f)
                        }
                        disabled={disabled}
                        aria-label={`Select ${f.name}`}
                      />
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-xs" title={f.name}>
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
  );
}
