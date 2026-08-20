"use client";

import * as React from "react";
import { Database, Download, Loader2, RefreshCw } from "lucide-react";

import {
  CompanyPicker,
  StockCodePicker,
  attachTickersToCompanies,
  type CompanyOption,
} from "@/components/ai/company-picker";
import { DbTestView } from "@/components/newspaper/db-test-view";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { isCombPilotAvailable } from "@/lib/newspaper-db";

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

type NewspaperDbExplorerProps = {
  className?: string;
};

export function NewspaperDbExplorer({ className }: NewspaperDbExplorerProps) {
  const [companies, setCompanies] = React.useState<CompanyOption[]>([]);
  const [rawCompanies, setRawCompanies] = React.useState<ExtractedCompany[]>(
    [],
  );
  const [selectedCompany, setSelectedCompany] = React.useState<string | null>(
    null,
  );
  const [loadingCompanies, setLoadingCompanies] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
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

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await loadCompanies();
      setTestRefreshToken((n) => n + 1);
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [loadCompanies]);

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
                  COMB table structure for every company · same description
                  rows; note tables fill after extraction
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
                disabled={refreshing || loadingCompanies}
              >
                <RefreshCw
                  className={cn(
                    "size-3.5",
                    (refreshing || loadingCompanies) && "animate-spin",
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

          {downloadError ? (
            <Alert variant="destructive">
              <AlertTitle>Download failed</AlertTitle>
              <AlertDescription>{downloadError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex min-w-0 w-full flex-col overscroll-x-none">
        <DbTestView
          company={selectedCompany}
          companyDisplayName={companyMeta?.displayName}
          refreshToken={testRefreshToken}
        />
      </div>
    </div>
  );
}
