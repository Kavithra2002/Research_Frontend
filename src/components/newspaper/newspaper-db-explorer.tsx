"use client";

import * as React from "react";
import {
  Building2,
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
} from "lucide-react";

import {
  CompanyPicker,
  type CompanyOption,
} from "@/components/ai/company-picker";
import { FsSheetTableView } from "@/components/newspaper/fs-sheet-table-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  COMMERCIAL_BANK_SLUG,
  type DbDriversPreview,
  type DbFsPreview,
  type DbPreview,
  type DbQuarterlyPreview,
  type DbRatiosPreview,
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
  { id: "drivers", label: "Drivers", pilotOnly: true },
  { id: "ratios", label: "Ratios", pilotOnly: true },
  { id: "quarterly", label: "Quarterly", pilotOnly: true },
];

const VIEW_TITLES: Record<DbViewMode, string> = {
  fs: "Financial statements",
  drivers: "Drivers (notes breakdown)",
  ratios: "Ratios",
  quarterly: "Quarterly P&L",
};

export function NewspaperDbExplorer() {
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

  const loadCompanies = React.useCallback(async () => {
    setLoadingCompanies(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/extracted", { cache: "no-store" });
      const json = (await res.json()) as ListResponse;
      if (!res.ok) {
        throw new Error(json.error ?? `Failed to load companies (${res.status})`);
      }
      const list = json.companies ?? [];
      setRawCompanies(list);
      setCompanies(
        list.map((c) => ({
          name: c.name,
          displayName: c.displayName,
          statements: [],
          totalReports: c.years?.length ?? 0,
        })),
      );
      setSelectedCompany((prev) => prev ?? list[0]?.name ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setCompanies([]);
      setRawCompanies([]);
    } finally {
      setLoadingCompanies(false);
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
    if (!pilotMode && viewMode !== "fs") {
      setViewMode("fs");
    }
  }, [pilotMode, viewMode]);

  const loadPreview = React.useCallback(async () => {
    if (!selectedCompany) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const qs = new URLSearchParams({
        view: viewMode,
        company: selectedCompany,
      });
      const res = await fetch(`/api/db/preview?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as DbPreview & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Preview failed (${res.status})`);
      setPreview(json);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedCompany, viewMode]);

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
  const tableRows = preview?.rows ?? [];
  const periodLabel = preview?.period_label ?? "";
  const unit = preview?.unit ?? "";
  const valueFormat =
    preview?.view === "ratios" ? "ratio" : "amount";
  const showAmountDisplaySelect = valueFormat === "amount";
  const cellsFilled =
    preview && "cells_filled" in preview ? preview.cells_filled : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
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
                    ? "Commercial Bank 2022 pilot · FS, Drivers, Ratios, Quarterly"
                    : "COMB FS layout · Excel download matches this view"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <CompanyPicker
                companies={companies}
                selectedCompany={selectedCompany}
                onSelectCompany={setSelectedCompany}
                loading={loadingCompanies}
                error={loadError}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void loadCompanies()}
                disabled={loadingCompanies}
              >
                <RefreshCw
                  className={cn("size-3.5", loadingCompanies && "animate-spin")}
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

            <div className="flex flex-wrap items-center gap-2">
              {companyMeta ? (
                <Badge variant="outline" className="gap-1 font-normal">
                  <Building2 className="size-3" />
                  {companyMeta.displayName}
                </Badge>
              ) : null}
              {preview?.view === "fs" && (preview as DbFsPreview).ticker ? (
                <Badge variant="secondary" className="font-normal">
                  {(preview as DbFsPreview).ticker}
                </Badge>
              ) : null}
              <Badge variant="outline" className="gap-1 font-normal">
                <FileSpreadsheet className="size-3" />
                {pilotMode ? "Cover + 4 sheets" : "Cover + FS"}
              </Badge>
              {pilotMode ? (
                <Badge variant="secondary" className="font-normal">
                  2022 pilot
                </Badge>
              ) : null}
              {cellsFilled != null ? (
                <Badge variant="secondary" className="font-normal">
                  {cellsFilled} values loaded
                </Badge>
              ) : null}
            </div>
          </div>

          {downloadError ? (
            <Alert variant="destructive">
              <AlertTitle>Download failed</AlertTitle>
              <AlertDescription>{downloadError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {previewError ? (
        <Alert variant="destructive" className="shrink-0">
          <AlertTitle>Could not load preview</AlertTitle>
          <AlertDescription>{previewError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {previewLoading ? (
          <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-xl border bg-card">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading {VIEW_TITLES[viewMode]}…
            </div>
          </div>
        ) : tableRows.length > 0 ? (
          <FsSheetTableView
            className="min-h-0 flex-1"
            title={VIEW_TITLES[viewMode]}
            periodLabel={periodLabel}
            unit={unit}
            columnLabels={columnLabels}
            columnKeys={columnKeys}
            rows={tableRows}
            valueFormat={valueFormat}
            enableNotes={viewMode === "fs" && pilotMode}
            amountDisplay={amountDisplay}
            onAmountDisplayChange={setAmountDisplay}
            showAmountDisplaySelect={showAmountDisplaySelect}
          />
        ) : (
          <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            {selectedCompany
              ? "No financial data to display for this company yet."
              : "Select a company to preview financial statements."}
          </div>
        )}
      </div>
    </div>
  );
}
