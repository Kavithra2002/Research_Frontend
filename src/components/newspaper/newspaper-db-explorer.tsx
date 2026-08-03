"use client";

import * as React from "react";
import {
  CalendarIcon,
  Database,
  Download,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";

import {
  CompanyPicker,
  StockCodePicker,
  attachTickersToCompanies,
  type CompanyOption,
} from "@/components/ai/company-picker";
import { DbTestView } from "@/components/newspaper/db-test-view";
import { FsSheetTableView } from "@/components/newspaper/fs-sheet-table-view";
import { NotesSheetTableView } from "@/components/newspaper/notes-sheet-table-view";
import {
  noteTablesHaveBankEntity,
  type NoteEntityPanel,
} from "@/components/newspaper/extracted-note-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  COMMERCIAL_BANK_SLUG,
  type DbPreview,
  type DbNotesPreview,
  type DbQuarterlyPreview,
  type DbViewMode,
  type DbAmountDisplay,
  isCombPilotAvailable,
} from "@/lib/newspaper-db";

type ExtractedYearNode = {
  year: number;
  annual?: unknown | null;
};

type ExtractedCompany = {
  name: string;
  displayName: string;
  years?: ExtractedYearNode[];
};

type ListResponse = {
  companies?: ExtractedCompany[];
  error?: string;
};

const VIEW_TABS: { id: DbViewMode; label: string; pilotOnly?: boolean }[] = [
  { id: "fs", label: "Annual FS" },
  { id: "quarterly", label: "Quarterly", pilotOnly: true },
  { id: "notes", label: "Notes", pilotOnly: true },
  { id: "test", label: "Test" },
];

const VIEW_TITLES: Record<DbViewMode, string> = {
  fs: "Financial statements",
  notes: "Notes",
  drivers: "Drivers (notes breakdown)",
  ratios: "Ratios",
  quarterly: "Quarterly P&L",
  test: "Test (consolidated filters)",
};

type DetailLevel = "summary" | "detailed";
type PeriodPreset = "6M" | "9M" | "TTM" | null;

function parseColumnEndDate(label: string, key: string): Date | null {
  // Quarterly labels like "Mar 2019" / keys like "2019-03"
  const keyMatch = key.match(/^(\d{4})-(\d{2})$/);
  if (keyMatch) {
    const year = Number(keyMatch[1]);
    const month = Number(keyMatch[2]);
    if (year && month >= 1 && month <= 12) {
      return new Date(year, month, 0); // last day of month
    }
  }
  const labelMatch = label.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i,
  );
  if (labelMatch) {
    const months: Record<string, number> = {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      oct: 10,
      nov: 11,
      dec: 12,
    };
    const month = months[labelMatch[1].toLowerCase()];
    const year = Number(labelMatch[2]);
    if (month && year) return new Date(year, month, 0);
  }
  // Annual year columns
  if (/^\d{4}$/.test(key) || /^\d{4}$/.test(label)) {
    const year = Number(/^\d{4}$/.test(key) ? key : label);
    return new Date(year, 11, 31);
  }
  return null;
}

function shiftMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatYearRangeLabel(
  fromYear: number | null,
  toYear: number | null,
): string {
  if (fromYear == null && toYear == null) return "Year range";
  if (fromYear != null && toYear != null) {
    return fromYear === toYear ? String(fromYear) : `${fromYear} – ${toYear}`;
  }
  return `${fromYear ?? toYear} – …`;
}

type NewspaperDbExplorerProps = {
  className?: string;
};

export function NewspaperDbExplorer({ className }: NewspaperDbExplorerProps) {
  const [companies, setCompanies] = React.useState<CompanyOption[]>([]);
  const [rawCompanies, setRawCompanies] = React.useState<ExtractedCompany[]>([]);
  const [selectedCompany, setSelectedCompany] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<DbViewMode>("fs");
  const [loadingCompanies, setLoadingCompanies] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<DbPreview | null>(null);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [amountDisplay, setAmountDisplay] =
    React.useState<DbAmountDisplay>("raw");
  const [refreshing, setRefreshing] = React.useState(false);
  const [detailLevel, setDetailLevel] = React.useState<DetailLevel>("summary");
  const [noteEntity, setNoteEntity] = React.useState<NoteEntityPanel>("group");
  const [periodPreset, setPeriodPreset] = React.useState<PeriodPreset>(null);
  const [fromYear, setFromYear] = React.useState<number | null>(null);
  const [toYear, setToYear] = React.useState<number | null>(null);
  const [yearRangeOpen, setYearRangeOpen] = React.useState(false);
  const [testRefreshToken, setTestRefreshToken] = React.useState(0);
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCompanies = React.useCallback(async () => {
    if (mountedRef.current) setLoadingCompanies(true);
    if (mountedRef.current) setLoadError(null);
    try {
      const [extractedRes, cseRes] = await Promise.all([
        fetch("/api/extracted", { cache: "no-store" }),
        fetch("/api/companies", { cache: "no-store" }),
      ]);
      const json = (await extractedRes.json()) as ListResponse;
      if (!extractedRes.ok) {
        throw new Error(
          json.error ?? `Failed to load companies (${extractedRes.status})`,
        );
      }
      const list = json.companies ?? [];
      if (!mountedRef.current) return list;

      let cseCompanies: { name: string; symbol: string }[] = [];
      try {
        const cseJson = (await cseRes.json()) as {
          companies?: { name: string; symbol: string }[];
        };
        if (cseRes.ok) cseCompanies = cseJson.companies ?? [];
      } catch {
        cseCompanies = [];
      }

      const options = attachTickersToCompanies(
        list.map((c) => ({
          name: c.name,
          displayName: c.displayName,
          statements: [],
          totalReports: c.years?.length ?? 0,
        })),
        cseCompanies,
      );

      setRawCompanies(list);
      setCompanies(options);
      setSelectedCompany((prev) => prev ?? list[0]?.name ?? null);
      return list;
    } catch (err) {
      if (!mountedRef.current) return [];
      setLoadError(err instanceof Error ? err.message : String(err));
      setCompanies([]);
      setRawCompanies([]);
      return [];
    } finally {
      if (mountedRef.current) setLoadingCompanies(false);
    }
  }, []);

  React.useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  const companyMeta = React.useMemo(
    () => rawCompanies.find((c) => c.name === selectedCompany) ?? null,
    [rawCompanies, selectedCompany],
  );

  const pilotMode = isCombPilotAvailable(selectedCompany);

  React.useEffect(() => {
    if (!pilotMode && viewMode !== "fs" && viewMode !== "test") {
      setViewMode("fs");
      return;
    }
    // Drivers / Ratios tabs are temporarily hidden from the UI.
    if (viewMode === "drivers" || viewMode === "ratios") {
      setViewMode("fs");
    }
  }, [pilotMode, viewMode]);

  const loadPreview = React.useCallback(
    async (companyOverride?: string | null) => {
      const company = companyOverride ?? selectedCompany;
      if (!company) return;
      // Test view loads its own data with consolidated filters.
      if (viewMode === "test") {
        if (mountedRef.current) {
          setPreview(null);
          setPreviewError(null);
          setPreviewLoading(false);
        }
        return;
      }
      if (mountedRef.current) setPreviewLoading(true);
      if (mountedRef.current) setPreviewError(null);
      try {
        const qs = new URLSearchParams({
          view: viewMode,
          company,
        });
        const res = await fetch(`/api/db/preview?${qs.toString()}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as DbPreview & { error?: string };
        if (!res.ok) {
          throw new Error(json.error ?? `Preview failed (${res.status})`);
        }
        if (mountedRef.current) setPreview(json);
      } catch (err) {
        if (!mountedRef.current) return;
        setPreviewError(err instanceof Error ? err.message : String(err));
        setPreview(null);
      } finally {
        if (mountedRef.current) setPreviewLoading(false);
      }
    },
    [selectedCompany, viewMode],
  );

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await loadCompanies();
      const company = selectedCompany ?? list[0]?.name ?? null;
      if (viewMode === "test") {
        setTestRefreshToken((n) => n + 1);
      } else {
        await loadPreview(company);
      }
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [loadCompanies, loadPreview, selectedCompany, viewMode]);

  React.useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const handleDownload = async () => {
    if (!selectedCompany) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const endpoint = pilotMode ? "/api/db/export-comb" : "/api/db/export";
      const qs = new URLSearchParams({ company: selectedCompany });
      const res = await fetch(`${endpoint}?${qs.toString()}`);
      if (!res.ok) {
        let message = `Download failed (${res.status})`;
        try {
          const json = (await res.json()) as { error?: string };
          message = json.error ?? message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition");
      const match = disposition?.match(/filename="([^"]+)"/i);
      const filename =
        match?.[1] ??
        `${companyMeta?.displayName ?? selectedCompany}_financial_workbook.xlsx`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  };

  const columnLabels =
    preview?.view === "quarterly"
      ? (preview as DbQuarterlyPreview).columns.map((c) => c.label)
      : preview && "years" in preview
        ? preview.years.map(String)
        : [];
  const columnKeys =
    preview?.view === "quarterly"
      ? (preview as DbQuarterlyPreview).columns.map((c) => c.key)
      : preview && "years" in preview
        ? preview.years.map(String)
        : [];

  const availableYears = React.useMemo(() => {
    const years = columnKeys
      .map((key) => Number(key.match(/^(\d{4})/)?.[1] ?? Number.NaN))
      .filter((year) => Number.isFinite(year));
    return [...new Set(years)].sort((a, b) => a - b);
  }, [columnKeys]);

  const fromDate = fromYear != null ? `${fromYear}-01-01` : "";
  const toDate = toYear != null
    ? `${toYear}-12-31`
    : fromYear != null
      ? `${fromYear}-12-31`
      : "";
  const dateFilterActive = fromYear != null || toYear != null;

  const clearYearRange = React.useCallback(() => {
    setFromYear(null);
    setToYear(null);
    setPeriodPreset(null);
    setYearRangeOpen(false);
  }, []);

  const updateFromYear = React.useCallback((year: number | null) => {
    setPeriodPreset(null);
    setFromYear(year);
    setToYear((currentTo) => {
      if (year == null || currentTo == null) return currentTo;
      return currentTo < year ? year : currentTo;
    });
  }, []);

  const updateToYear = React.useCallback((year: number | null) => {
    setPeriodPreset(null);
    setToYear(year);
    setFromYear((currentFrom) => {
      if (year == null || currentFrom == null) return currentFrom;
      return currentFrom > year ? year : currentFrom;
    });
  }, []);

  const applyPeriodPreset = React.useCallback(
    (preset: PeriodPreset) => {
      setPeriodPreset(preset);
      if (!preset || columnKeys.length === 0) return;
      const ends = columnKeys
        .map((key, i) => parseColumnEndDate(columnLabels[i] ?? key, key))
        .filter((d): d is Date => d != null)
        .sort((a, b) => a.getTime() - b.getTime());
      if (ends.length === 0) return;
      const end = ends[ends.length - 1];
      const months = preset === "6M" ? 6 : preset === "9M" ? 9 : 12;
      const start = shiftMonths(end, -(months - 1));
      start.setDate(1);
      setFromYear(start.getFullYear());
      setToYear(end.getFullYear());
    },
    [columnKeys, columnLabels],
  );

  const filteredColumns = React.useMemo(() => {
    // Date / period filters apply only on Notes.
    if (viewMode !== "notes" || (!fromDate && !toDate)) {
      return { labels: columnLabels, keys: columnKeys };
    }
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
    const labels: string[] = [];
    const keys: string[] = [];
    columnKeys.forEach((key, i) => {
      const label = columnLabels[i] ?? key;
      const end = parseColumnEndDate(label, key);
      if (!end) {
        labels.push(label);
        keys.push(key);
        return;
      }
      if (from && end < from) return;
      if (to && end > to) return;
      labels.push(label);
      keys.push(key);
    });
    return { labels, keys };
  }, [columnKeys, columnLabels, fromDate, toDate, viewMode]);

  const filteredYears = React.useMemo(() => {
    if (preview?.view !== "notes" || viewMode !== "notes") return [];
    return filteredColumns.keys
      .map((key) => Number(key))
      .filter((year) => Number.isFinite(year));
  }, [filteredColumns.keys, preview?.view, viewMode]);

  const tableRows = React.useMemo(() => preview?.rows ?? [], [preview?.rows]);

  const noteBankMeta = React.useMemo(() => {
    if (viewMode !== "notes") {
      return { available: false, bankLabel: "Bank" };
    }
    for (const row of tableRows) {
      const meta = noteTablesHaveBankEntity(row.note_tables_by_year);
      if (meta.available) return meta;
    }
    return { available: false, bankLabel: "Bank" };
  }, [tableRows, viewMode]);

  const periodLabel = preview?.period_label ?? "";
  const unit = preview?.unit ?? "";
  const valueFormat =
    preview?.view === "ratios" ? "ratio" : "amount";
  const showAmountDisplaySelect = valueFormat === "amount";

  const segmentBtn = (active: boolean) =>
    cn(
      "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
      active
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className={cn("flex min-w-0 w-full flex-col gap-3", className)}>
      <Card className="shrink-0 border-lime-500/25 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-lime-500/10 text-lime-600 dark:text-lime-400">
                <Database className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Financial database</p>
                <p className="text-xs text-muted-foreground">
                  {pilotMode
                    ? "Commercial Bank COMB pilot · FS, Quarterly, Notes (2017–2025)"
                    : "COMB FS layout · Excel download matches this view"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-start gap-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <CompanyPicker
                  companies={companies}
                  selectedCompany={selectedCompany}
                  onSelectCompany={setSelectedCompany}
                  loading={loadingCompanies}
                  error={loadError}
                />
                <StockCodePicker
                  companies={companies}
                  selectedCompany={selectedCompany}
                  onSelectCompany={setSelectedCompany}
                  loading={loadingCompanies}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void handleRefresh()}
                disabled={refreshing || loadingCompanies || previewLoading}
              >
                <RefreshCw
                  className={cn(
                    "size-3.5",
                    (refreshing || loadingCompanies || previewLoading) &&
                      "animate-spin",
                  )}
                />
                Refresh
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={!selectedCompany || downloading}
                onClick={() => void handleDownload()}
              >
                {downloading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Download Excel
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
              {VIEW_TABS.map((tab) => {
                const disabled = tab.pilotOnly && !pilotMode;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={disabled}
                    title={
                      disabled
                        ? "Available for Commercial Bank 2022 pilot"
                        : undefined
                    }
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      viewMode === tab.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                      disabled && "cursor-not-allowed opacity-45",
                    )}
                    onClick={() => {
                      if (!disabled) setViewMode(tab.id);
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {viewMode === "notes" ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                  <button
                    type="button"
                    className={segmentBtn(detailLevel === "summary")}
                    onClick={() => setDetailLevel("summary")}
                    title="Normal view — expand note sections manually"
                  >
                    Summary
                  </button>
                  <button
                    type="button"
                    className={segmentBtn(detailLevel === "detailed")}
                    onClick={() => setDetailLevel("detailed")}
                    title="Fully expand all note line items"
                  >
                    Detailed
                  </button>
                </div>

                {noteBankMeta.available ? (
                  <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                    <button
                      type="button"
                      className={segmentBtn(noteEntity === "group")}
                      onClick={() => setNoteEntity("group")}
                    >
                      Group
                    </button>
                    <button
                      type="button"
                      className={segmentBtn(noteEntity === "bank")}
                      onClick={() => setNoteEntity("bank")}
                    >
                      {noteBankMeta.bankLabel}
                    </button>
                  </div>
                ) : null}

                <div className="flex items-center gap-1">
                  <Popover open={yearRangeOpen} onOpenChange={setYearRangeOpen}>
                    <PopoverTrigger
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium shadow-sm transition-colors",
                        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        dateFilterActive
                          ? "border-lime-500/40 text-foreground"
                          : "text-muted-foreground",
                      )}
                      aria-label="Filter by year range"
                      title="Filter columns by year range"
                    >
                      <CalendarIcon className="size-3.5 shrink-0" />
                      <span className="max-w-[10rem] truncate">
                        {formatYearRangeLabel(fromYear, toYear)}
                      </span>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 p-3">
                      <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              From
                            </span>
                            <select
                              value={fromYear ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                updateFromYear(
                                  value ? Number(value) : null,
                                );
                              }}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              aria-label="From year"
                            >
                              <option value="">Any</option>
                              {availableYears.map((year) => (
                                <option key={`from-${year}`} value={year}>
                                  {year}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              To
                            </span>
                            <select
                              value={toYear ?? ""}
                              onChange={(e) => {
                                const value = e.target.value;
                                updateToYear(value ? Number(value) : null);
                              }}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              aria-label="To year"
                            >
                              <option value="">Any</option>
                              {availableYears.map((year) => (
                                <option key={`to-${year}`} value={year}>
                                  {year}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] text-muted-foreground">
                            From and To are independent
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={!dateFilterActive}
                            onClick={clearYearRange}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {dateFilterActive ? (
                    <button
                      type="button"
                      onClick={clearYearRange}
                      className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Clear year range filter"
                      title="Show all years"
                    >
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                  {(["6M", "9M", "TTM"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={segmentBtn(periodPreset === preset)}
                      onClick={() => {
                        if (periodPreset === preset) {
                          clearYearRange();
                          return;
                        }
                        applyPeriodPreset(preset);
                      }}
                      title={
                        periodPreset === preset
                          ? "Click again to clear period filter"
                          : `Show last ${preset === "TTM" ? "12 months" : preset}`
                      }
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {downloadError ? (
            <Alert variant="destructive">
              <AlertTitle>Download failed</AlertTitle>
              <AlertDescription>{downloadError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {viewMode !== "test" && previewError ? (
        <Alert variant="destructive" className="shrink-0">
          <AlertTitle>Could not load preview</AlertTitle>
          <AlertDescription>{previewError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex min-w-0 w-full flex-col overscroll-x-none">
        {viewMode === "test" ? (
          <DbTestView
            company={selectedCompany}
            companyDisplayName={companyMeta?.displayName}
            refreshToken={testRefreshToken}
          />
        ) : previewLoading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border bg-card">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading {VIEW_TITLES[viewMode]}…
            </div>
          </div>
        ) : tableRows.length > 0 ? (
          viewMode === "notes" ? (
            <NotesSheetTableView
              periodLabel={periodLabel}
              unit={unit}
              years={
                filteredYears.length > 0
                  ? filteredYears
                  : (preview as DbNotesPreview).years
              }
              rows={tableRows}
              notesExtractedYears={
                (preview as DbNotesPreview).notes_extracted_years
              }
              amountDisplay={amountDisplay}
              onAmountDisplayChange={setAmountDisplay}
              companySlug={selectedCompany ?? preview?.company_slug}
              detailLevel={detailLevel}
              noteEntity={noteEntity}
            />
          ) : (
            <FsSheetTableView
              pageScroll
              title={VIEW_TITLES[viewMode]}
              periodLabel={periodLabel}
              unit={unit}
              columnLabels={filteredColumns.labels}
              columnKeys={filteredColumns.keys}
              rows={tableRows}
              valueFormat={valueFormat}
              enableNotes={viewMode === "fs" && pilotMode}
              companySlug={selectedCompany ?? preview?.company_slug}
              amountDisplay={amountDisplay}
              onAmountDisplayChange={setAmountDisplay}
              showAmountDisplaySelect={showAmountDisplaySelect}
            />
          )
        ) : (
          <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            {selectedCompany
              ? "No financial data to display for this company yet."
              : "Select a company to preview financial statements."}
          </div>
        )}
      </div>
    </div>
  );
}
