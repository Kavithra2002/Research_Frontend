"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronsUpDown,
  FileText,
  Globe,
  Inbox,
  Layers,
  Loader2,
  RefreshCw,
  SquareArrowOutUpRight,
  Sparkles,
  Wand2,
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  clearReportSelections,
  listReportSelections,
  replaceReportSelections,
  selectionKey,
  type SelectionItem,
} from "@/lib/report-selections";
import {
  listCompanyGroups,
  type CompanyGroup,
} from "@/lib/company-groups";
import {
  cancelScan as storeCancelScan,
  getServerSnapshot,
  getSnapshot,
  runScan as storeRunScan,
  subscribe as subscribeScanStore,
} from "@/components/system/scan-store";
import {
  getServerSnapshot as getUpdateServerSnapshot,
  getSnapshot as getUpdateSnapshot,
  resetUpdate,
  runUpdate,
  subscribe as subscribeUpdateStore,
} from "@/components/system/update-store";

const SCAN_SCOPE_STORAGE_KEY = "ambeon.system.scan.scope";

type ScanScope =
  | { kind: "all" }
  | { kind: "group"; groupId: string };

function loadStoredScope(): ScanScope {
  if (typeof window === "undefined") return { kind: "all" };
  try {
    const raw = window.localStorage.getItem(SCAN_SCOPE_STORAGE_KEY);
    if (!raw) return { kind: "all" };
    const parsed = JSON.parse(raw) as ScanScope;
    if (parsed && parsed.kind === "group" && typeof parsed.groupId === "string") {
      return parsed;
    }
  } catch {}
  return { kind: "all" };
}

function persistScope(scope: ScanScope) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCAN_SCOPE_STORAGE_KEY, JSON.stringify(scope));
  } catch {}
}

type UploadedFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

type UploadedReport = {
  company: string;
  reportType: string;
  files: UploadedFile[];
};

type ApiListResponse = {
  root?: string;
  reports?: UploadedReport[];
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

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function buildFileUrl(
  company: string,
  type: string,
  file: string,
  download = false,
) {
  const params = new URLSearchParams({ company, type, file });
  if (download) params.set("download", "1");
  return `/api/system/file?${params.toString()}`;
}

export function NewlyUpdatedPanel() {
  const scan = React.useSyncExternalStore(
    subscribeScanStore,
    getSnapshot,
    getServerSnapshot,
  );
  const update = React.useSyncExternalStore(
    subscribeUpdateStore,
    getUpdateSnapshot,
    getUpdateServerSnapshot,
  );

  const [reports, setReports] = React.useState<UploadedReport[]>([]);
  const [listLoading, setListLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [updateConfirmOpen, setUpdateConfirmOpen] = React.useState(false);
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(
    new Set(),
  );
  const [selectionSyncing, setSelectionSyncing] = React.useState(false);
  const [selectionError, setSelectionError] = React.useState<string | null>(
    null,
  );
  const [groups, setGroups] = React.useState<CompanyGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = React.useState(true);
  const [groupsError, setGroupsError] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState<ScanScope>({ kind: "all" });
  const [scopePickerOpen, setScopePickerOpen] = React.useState(false);

  React.useEffect(() => {
    setScope(loadStoredScope());
  }, []);

  const loadGroups = React.useCallback(async () => {
    setGroupsLoading(true);
    setGroupsError(null);
    try {
      const data = await listCompanyGroups();
      setGroups(data.groups);
    } catch (e) {
      setGroupsError(e instanceof Error ? e.message : String(e));
      setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const activeGroup = React.useMemo<CompanyGroup | null>(() => {
    if (scope.kind !== "group") return null;
    return groups.find((g) => g._id === scope.groupId) ?? null;
  }, [groups, scope]);

  // If the selected group disappears (e.g. deleted in another tab), fall back
  // to "all companies" to avoid running an invalid scan.
  React.useEffect(() => {
    if (
      scope.kind === "group" &&
      !groupsLoading &&
      !activeGroup &&
      groups.length >= 0
    ) {
      setScope({ kind: "all" });
      persistScope({ kind: "all" });
    }
  }, [scope, groupsLoading, activeGroup, groups.length]);

  const changeScope = React.useCallback((next: ScanScope) => {
    setScope(next);
    persistScope(next);
  }, []);

  const loadList = React.useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/system/newly-uploaded", {
        cache: "no-store",
      });
      const data = (await res.json()) as ApiListResponse;
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setReports(data.reports ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setReports([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadSelections = React.useCallback(async () => {
    setSelectionError(null);
    try {
      const data = await listReportSelections();
      setSelectedKeys(
        new Set(
          data.items.map((it) =>
            selectionKey({
              company: it.company,
              report_type: it.report_type,
              file_name: it.file_name,
            }),
          ),
        ),
      );
    } catch (e) {
      setSelectionError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  React.useEffect(() => {
    loadList();
    loadSelections();
  }, [loadList, loadSelections]);

  // Refresh the downloaded-reports list (and selections) whenever a scan
  // finishes.
  const lastCompletedRef = React.useRef(scan.completedRunCount);
  React.useEffect(() => {
    if (scan.completedRunCount !== lastCompletedRef.current) {
      lastCompletedRef.current = scan.completedRunCount;
      loadList();
      loadSelections();
    }
  }, [scan.completedRunCount, loadList, loadSelections]);

  const allItems = React.useMemo<SelectionItem[]>(() => {
    const items: SelectionItem[] = [];
    for (const r of reports) {
      for (const f of r.files) {
        items.push({
          company: r.company,
          report_type: r.reportType,
          file_name: f.name,
        });
      }
    }
    return items;
  }, [reports]);

  const allItemKeys = React.useMemo(
    () => allItems.map((it) => selectionKey(it)),
    [allItems],
  );

  // Prune selections that no longer correspond to a present file.
  const validSelectedKeys = React.useMemo(() => {
    if (selectedKeys.size === 0) return selectedKeys;
    const valid = new Set<string>();
    const presentKeys = new Set(allItemKeys);
    for (const k of selectedKeys) if (presentKeys.has(k)) valid.add(k);
    return valid;
  }, [selectedKeys, allItemKeys]);

  const selectedItems = React.useMemo<SelectionItem[]>(
    () =>
      allItems.filter((it) => validSelectedKeys.has(selectionKey(it))),
    [allItems, validSelectedKeys],
  );

  const selectedCount = validSelectedKeys.size;
  const totalCount = allItems.length;
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const noneSelected = selectedCount === 0;

  const persistSelections = React.useCallback(
    async (next: Set<string>) => {
      setSelectionSyncing(true);
      setSelectionError(null);
      try {
        const presentKeys = new Set(allItemKeys);
        const items = allItems.filter((it) => {
          const k = selectionKey(it);
          return presentKeys.has(k) && next.has(k);
        });
        await replaceReportSelections(items);
      } catch (e) {
        setSelectionError(e instanceof Error ? e.message : String(e));
        await loadSelections();
      } finally {
        setSelectionSyncing(false);
      }
    },
    [allItems, allItemKeys, loadSelections],
  );

  const toggleSelection = React.useCallback(
    (item: SelectionItem) => {
      const key = selectionKey(item);
      const next = new Set(selectedKeys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setSelectedKeys(next);
      void persistSelections(next);
    },
    [selectedKeys, persistSelections],
  );

  const toggleSelectAll = React.useCallback(() => {
    if (allSelected) {
      setSelectedKeys(new Set());
      void persistSelections(new Set());
    } else {
      const next = new Set(allItemKeys);
      setSelectedKeys(next);
      void persistSelections(next);
    }
  }, [allSelected, allItemKeys, persistSelections]);

  const handleClearSelection = React.useCallback(async () => {
    setSelectedKeys(new Set());
    setSelectionSyncing(true);
    setSelectionError(null);
    try {
      await clearReportSelections();
    } catch (e) {
      setSelectionError(e instanceof Error ? e.message : String(e));
      await loadSelections();
    } finally {
      setSelectionSyncing(false);
    }
  }, [loadSelections]);

  const handleRunScan = React.useCallback(() => {
    if (scope.kind === "group" && activeGroup) {
      void storeRunScan({
        symbols: activeGroup.symbols,
        companies: activeGroup.companies,
        groupId: activeGroup._id,
        groupName: activeGroup.name,
      });
    } else {
      void storeRunScan();
    }
  }, [scope.kind, activeGroup]);

  const handleCancelScan = React.useCallback(() => {
    void storeCancelScan();
  }, []);

  const handleConfirmUpdate = React.useCallback(() => {
    if (selectedItems.length === 0) return;
    setUpdateConfirmOpen(false);
    void runUpdate({ items: selectedItems });
  }, [selectedItems]);

  const totalReports = React.useMemo(
    () => reports.reduce((acc, r) => acc + r.files.length, 0),
    [reports],
  );

  const companyCount = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of reports) set.add(r.company);
    return set.size;
  }, [reports]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, UploadedReport[]>();
    for (const r of reports) {
      const list = map.get(r.company) ?? [];
      list.push(r);
      map.set(r.company, list);
    }
    return Array.from(map.entries());
  }, [reports]);

  const progressPct = scan.progress
    ? Math.min(
        100,
        Math.round((scan.progress.index / Math.max(1, scan.progress.total)) * 100),
      )
    : 0;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
      <Card size="sm">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-muted-foreground" />
                Newly uploaded reports
              </CardTitle>
              <CardDescription className="mt-1">
                Scan the CSE listing for reports uploaded today and download
                any new annual, quarterly or other filings into{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                  updated_reports/
                </code>
                . The scan keeps running in the background even if you leave
                this page.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ScanScopePicker
                open={scopePickerOpen}
                onOpenChange={setScopePickerOpen}
                scope={scope}
                groups={groups}
                groupsLoading={groupsLoading}
                groupsError={groupsError}
                activeGroup={activeGroup}
                onChange={changeScope}
                onRefreshGroups={loadGroups}
                disabled={scan.scanning}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadList()}
                disabled={listLoading || scan.scanning}
              >
                {listLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                Refresh list
              </Button>
              {scan.scanning ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancelScan}
                >
                  Cancel scan
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleRunScan}
                  disabled={
                    scope.kind === "group" &&
                    (groupsLoading || !activeGroup)
                  }
                  title={
                    scope.kind === "group" && !activeGroup
                      ? "Selected group is no longer available"
                      : undefined
                  }
                >
                  <Sparkles />
                  Scan
                  {scope.kind === "group" && activeGroup
                    ? ` "${activeGroup.name}"`
                    : " all companies"}
                </Button>
              )}
              {reports.length > 0 && !scan.scanning && (
                update.updating ? (
                  <div
                    className="flex h-8 min-w-[14rem] items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-2.5 text-xs"
                    aria-live="polite"
                  >
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="truncate font-medium text-emerald-700 dark:text-emerald-300"
                          title={update.message}
                        >
                          {update.message || "Updating system..."}
                        </span>
                        <span className="text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {update.progress}%
                        </span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-emerald-500/15">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                          style={{ width: `${update.progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUpdateConfirmOpen(true)}
                    disabled={noneSelected}
                    title={
                      noneSelected
                        ? "Select at least one report to extract"
                        : undefined
                    }
                    className="border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    <Wand2 className="text-emerald-600 dark:text-emerald-400" />
                    Extract selected
                    {selectedCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      >
                        {selectedCount}
                      </Badge>
                    )}
                  </Button>
                )
              )}
            </div>
          </div>
        </CardHeader>

        {(scan.scanning ||
          scan.summary ||
          scan.error ||
          scan.log.length > 0 ||
          update.updating ||
          update.error ||
          update.lastCompletedAt !== null) && (
          <CardContent className="flex flex-col gap-3">
            {scan.scanning && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-3.5 animate-spin" />
                    {scan.progress
                      ? `Checking ${scan.progress.index} of ${scan.progress.total}: ${scan.progress.company}`
                      : "Starting scan..."}
                  </span>
                  <span>
                    {scan.foundDuringScan} new report
                    {scan.foundDuringScan === 1 ? "" : "s"} found
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width] duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            {scan.summary && !scan.scanning && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span className="font-medium">
                  Scan complete for {scan.summary.targetDate}.
                </span>
                <span className="text-muted-foreground">
                  {scan.summary.foundCount} new report
                  {scan.summary.foundCount === 1 ? "" : "s"} downloaded
                  {scan.summary.failedCount > 0
                    ? `, ${scan.summary.failedCount} failed`
                    : ""}{" "}
                  across {scan.summary.totalCompanies} companies.
                </span>
              </div>
            )}

            {scan.error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{scan.error}</span>
              </div>
            )}

            {scan.log.length > 0 && (
              <details className="rounded-lg border bg-muted/30">
                <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground">
                  Activity log ({scan.log.length})
                </summary>
                <ScrollArea className="max-h-48">
                  <ul className="flex flex-col gap-1 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {scan.log.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </ScrollArea>
              </details>
            )}

            {update.updating && (
              <div className="flex flex-col gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <Wand2 className="size-3.5" />
                    {update.message || "Updating system..."}
                  </span>
                  <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {update.progress}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-500/15">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                    style={{ width: `${update.progress}%` }}
                  />
                </div>
              </div>
            )}

            {!update.updating && update.lastCompletedAt !== null && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  <span className="font-medium">System updated successfully.</span>
                  <span className="text-muted-foreground">
                    {update.message}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => resetUpdate()}
                >
                  Dismiss
                </Button>
              </div>
            )}

            {!update.updating && update.error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{update.error}</span>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <Dialog open={updateConfirmOpen} onOpenChange={setUpdateConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="size-4 text-emerald-600 dark:text-emerald-400" />
              Extract selected reports?
            </DialogTitle>
            <DialogDescription>
              This will process the {selectedCount} selected report
              {selectedCount === 1 ? "" : "s"} and refresh the extracted data
              in the system. The remaining {totalReports - selectedCount}{" "}
              downloaded report
              {totalReports - selectedCount === 1 ? "" : "s"} will be left
              untouched. It can take a few minutes; you can keep using the
              app while it runs.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
              }
            />
            <Button
              size="sm"
              onClick={handleConfirmUpdate}
              disabled={selectedCount === 0}
              className="bg-emerald-600 text-white hover:bg-emerald-600/90 dark:bg-emerald-500 dark:hover:bg-emerald-500/90"
            >
              <Wand2 />
              Yes, extract {selectedCount} report
              {selectedCount === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card size="sm" className="flex min-h-0 flex-1 flex-col py-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-muted-foreground" />
            <span className="font-heading text-sm font-medium">
              Downloaded reports
            </span>
            <Badge variant="secondary" className="ml-1">
              {totalReports}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {totalCount > 0 && (
              <label className="flex items-center gap-2 text-foreground">
                <Checkbox
                  checked={allSelected}
                  indeterminate={selectedCount > 0 && !allSelected}
                  onCheckedChange={toggleSelectAll}
                  disabled={selectionSyncing}
                  aria-label="Select all reports"
                />
                <span className="font-medium">
                  Select all{" "}
                  <span className="text-muted-foreground">
                    ({selectedCount}/{totalCount})
                  </span>
                </span>
              </label>
            )}
            {selectedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={handleClearSelection}
                disabled={selectionSyncing}
              >
                Clear
              </Button>
            )}
            <span>
              {companyCount} compan{companyCount === 1 ? "y" : "ies"}
            </span>
          </div>
        </div>
        {selectionError && (
          <div className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="flex-1">{selectionError}</span>
            <Button
              variant="ghost"
              size="sm"
              className="-my-1 h-6 px-2 text-[11px]"
              onClick={() => setSelectionError(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          {listError ? (
            <div className="flex flex-1 items-center justify-center p-10">
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{listError}</span>
              </div>
            </div>
          ) : listLoading && reports.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading downloaded reports...
            </div>
          ) : reports.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-10 text-center">
              <div className="max-w-sm">
                <Inbox className="mx-auto size-8 text-muted-foreground" />
                <h3 className="mt-3 font-heading text-base font-medium">
                  No new reports yet
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Click the <span className="font-medium text-foreground">Scan</span> button to check the
                  Colombo Stock Exchange for reports uploaded today
                  {scope.kind === "group" && activeGroup
                    ? ` in group "${activeGroup.name}"`
                    : ""}
                  .
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <ul className="divide-y">
                {grouped.map(([company, companyReports]) => {
                  const companyTotal = companyReports.reduce(
                    (acc, r) => acc + r.files.length,
                    0,
                  );
                  const companyFileKeys = companyReports.flatMap((r) =>
                    r.files.map((f) =>
                      selectionKey({
                        company,
                        report_type: r.reportType,
                        file_name: f.name,
                      }),
                    ),
                  );
                  const companySelected = companyFileKeys.filter((k) =>
                    validSelectedKeys.has(k),
                  ).length;
                  const companyAll =
                    companyFileKeys.length > 0 &&
                    companySelected === companyFileKeys.length;
                  const companyIndeterminate =
                    companySelected > 0 && !companyAll;
                  const toggleCompany = () => {
                    const next = new Set(selectedKeys);
                    if (companyAll) {
                      for (const k of companyFileKeys) next.delete(k);
                    } else {
                      for (const k of companyFileKeys) next.add(k);
                    }
                    setSelectedKeys(next);
                    void persistSelections(next);
                  };
                  return (
                    <li key={company} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={companyAll}
                          indeterminate={companyIndeterminate}
                          onCheckedChange={toggleCompany}
                          disabled={selectionSyncing}
                          aria-label={`Select all files for ${company}`}
                        />
                        <Building2 className="size-4 text-muted-foreground" />
                        <span
                          className="truncate text-sm font-medium"
                          title={company}
                        >
                          {company}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {companySelected}/{companyTotal}
                        </Badge>
                      </div>
                      <div className="mt-2 ml-6 flex flex-col gap-2">
                        {companyReports.map((r) => {
                          const groupKeys = r.files.map((f) =>
                            selectionKey({
                              company,
                              report_type: r.reportType,
                              file_name: f.name,
                            }),
                          );
                          const groupSelected = groupKeys.filter((k) =>
                            validSelectedKeys.has(k),
                          ).length;
                          const groupAll =
                            groupKeys.length > 0 &&
                            groupSelected === groupKeys.length;
                          const groupIndeterminate =
                            groupSelected > 0 && !groupAll;
                          const toggleGroup = () => {
                            const next = new Set(selectedKeys);
                            if (groupAll) {
                              for (const k of groupKeys) next.delete(k);
                            } else {
                              for (const k of groupKeys) next.add(k);
                            }
                            setSelectedKeys(next);
                            void persistSelections(next);
                          };
                          return (
                            <div
                              key={`${company}/${r.reportType}`}
                              className="rounded-lg border bg-muted/20"
                            >
                              <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                  <Checkbox
                                    checked={groupAll}
                                    indeterminate={groupIndeterminate}
                                    onCheckedChange={toggleGroup}
                                    disabled={selectionSyncing}
                                    aria-label={`Select all ${r.reportType} files for ${company}`}
                                  />
                                  <span>{r.reportType}</span>
                                  <Separator
                                    orientation="vertical"
                                    className="h-3"
                                  />
                                  <span>
                                    {groupSelected}/{r.files.length} selected
                                  </span>
                                </div>
                              </div>
                              <ul className="divide-y">
                                {r.files.map((file) => {
                                  const url = buildFileUrl(
                                    company,
                                    r.reportType,
                                    file.name,
                                  );
                                  const item: SelectionItem = {
                                    company,
                                    report_type: r.reportType,
                                    file_name: file.name,
                                  };
                                  const fileKey = selectionKey(item);
                                  const fileSelected =
                                    validSelectedKeys.has(fileKey);
                                  return (
                                    <li
                                      key={file.name}
                                      className={cn(
                                        "flex items-center gap-2 px-3 py-2",
                                        "hover:bg-muted/40",
                                        fileSelected && "bg-primary/5",
                                      )}
                                    >
                                      <Checkbox
                                        checked={fileSelected}
                                        onCheckedChange={() =>
                                          toggleSelection(item)
                                        }
                                        disabled={selectionSyncing}
                                        aria-label={`Select ${file.name}`}
                                      />
                                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                                      <div className="min-w-0 flex-1">
                                        <div
                                          className="truncate text-sm"
                                          title={file.name}
                                        >
                                          {file.name}
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                                          <span>{formatBytes(file.size)}</span>
                                          <span aria-hidden="true">·</span>
                                          <span>
                                            {formatDateTime(file.modifiedAt)}
                                          </span>
                                        </div>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label="Open in new window"
                                        title="Open in new window"
                                        nativeButton={false}
                                        render={
                                          <a
                                            href={url}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              window.open(
                                                url,
                                                "_blank",
                                                "noopener,noreferrer,width=1100,height=850",
                                              );
                                            }}
                                          />
                                        }
                                      >
                                        <SquareArrowOutUpRight />
                                      </Button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </div>
      </Card>
    </div>
  );
}

type ScanScopePickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: ScanScope;
  groups: CompanyGroup[];
  groupsLoading: boolean;
  groupsError: string | null;
  activeGroup: CompanyGroup | null;
  onChange: (scope: ScanScope) => void;
  onRefreshGroups: () => void;
  disabled?: boolean;
};

function ScanScopePicker({
  open,
  onOpenChange,
  scope,
  groups,
  groupsLoading,
  groupsError,
  activeGroup,
  onChange,
  onRefreshGroups,
  disabled,
}: ScanScopePickerProps) {
  const triggerLabel =
    scope.kind === "group" && activeGroup
      ? activeGroup.name
      : scope.kind === "group"
      ? "Group unavailable"
      : "All companies";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label="Choose scan scope"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {scope.kind === "group" ? (
            <Layers className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <Globe className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm" title={triggerLabel}>
            {triggerLabel}
          </span>
          {scope.kind === "group" && activeGroup ? (
            <Badge variant="secondary" className="text-[10px]">
              {activeGroup.symbols.length || activeGroup.companies.length}
            </Badge>
          ) : null}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-(--anchor-width) min-w-[280px] max-w-[360px] p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            Scan scope
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={(e) => {
              e.preventDefault();
              onRefreshGroups();
            }}
            disabled={groupsLoading}
          >
            {groupsLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
            Refresh
          </Button>
        </div>
        <ScrollArea className="max-h-[280px]">
          <ul className="flex flex-col gap-0.5 p-1">
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange({ kind: "all" });
                  onOpenChange(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                  "hover:bg-muted",
                  scope.kind === "all" && "bg-muted text-foreground",
                )}
              >
                <Globe className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">All companies</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    Scan every CSE-listed company.
                  </div>
                </div>
                {scope.kind === "all" && (
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                )}
              </button>
            </li>
            {groups.length > 0 && (
              <li className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Groups
              </li>
            )}
            {groupsError && (
              <li className="px-2 py-2 text-xs text-destructive">
                {groupsError}
              </li>
            )}
            {!groupsLoading && groups.length === 0 && !groupsError && (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                No groups yet. Create one from the AI Configuration page.
              </li>
            )}
            {groups.map((g) => {
              const isActive =
                scope.kind === "group" && scope.groupId === g._id;
              const count = g.symbols.length || g.companies.length;
              return (
                <li key={g._id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange({ kind: "group", groupId: g._id });
                      onOpenChange(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      "hover:bg-muted",
                      isActive && "bg-muted text-foreground",
                    )}
                  >
                    <Layers className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm" title={g.name}>
                        {g.name}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {count} compan{count === 1 ? "y" : "ies"}
                        {g.description ? ` · ${g.description}` : ""}
                      </div>
                    </div>
                    {isActive && (
                      <CheckCircle2 className="size-3.5 text-emerald-500" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

