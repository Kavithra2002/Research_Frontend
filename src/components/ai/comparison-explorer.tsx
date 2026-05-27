"use client";

import * as React from "react";
import {
  Database,
  GitCompare,
  ImageIcon,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { CompanyPicker } from "@/components/ai/company-picker";
import { StatementTypePills } from "@/components/ai/statement-type-pills";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { sortStatementKeys } from "@/lib/statement-types";
import {
  ExtractedStatement,
  statementsFromResults,
} from "@/components/extracted/extracted-tables-view";
import { StatementBlock } from "@/components/extracted/extracted-tables-view";

type Company = {
  name: string;
  displayName: string;
  statements: string[];
  model: string | null;
  generatedAt: string | null;
  totalReports: number;
};

type ListResponse = {
  companies?: Company[];
  error?: string;
};

type DataResponse = {
  results?: Record<string, unknown>;
  error?: string;
};

type CaptureImage = {
  name: string;
  url: string;
};

type CapturesResponse = {
  statements?: { key: string; images: CaptureImage[] }[];
  error?: string;
};

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

export function ComparisonExplorer() {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = React.useState<string | null>(
    null,
  );

  const [statements, setStatements] = React.useState<ExtractedStatement[]>([]);
  const [capturesByKey, setCapturesByKey] = React.useState<
    Record<string, CaptureImage[]>
  >({});
  const [dataLoading, setDataLoading] = React.useState(false);
  const [dataError, setDataError] = React.useState<string | null>(null);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/extracted", { cache: "no-store" });
      const data = (await res.json()) as ListResponse;
      if (!res.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
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

  React.useEffect(() => {
    if (!selectedCompany && companies.length > 0) {
      setSelectedCompany(companies[0].name);
    }
  }, [companies, selectedCompany]);

  const company = React.useMemo(
    () => companies.find((c) => c.name === selectedCompany) ?? null,
    [companies, selectedCompany],
  );

  React.useEffect(() => {
    if (!selectedCompany) {
      setStatements([]);
      setCapturesByKey({});
      setDataError(null);
      setSelectedKey(null);
      return;
    }

    let cancelled = false;
    setDataLoading(true);
    setDataError(null);

    Promise.all([
      fetch(
        `/api/extracted/data?company=${encodeURIComponent(selectedCompany)}`,
        { cache: "no-store" },
      ).then(async (res) => {
        const json = (await res.json()) as DataResponse;
        if (!res.ok) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }
        return json;
      }),
      fetch(
        `/api/extracted/captures?company=${encodeURIComponent(selectedCompany)}`,
        { cache: "no-store" },
      ).then(async (res) => {
        const json = (await res.json()) as CapturesResponse;
        if (!res.ok) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }
        return json;
      }),
    ])
      .then(([dataJson, capturesJson]) => {
        if (cancelled) return;

        const nextStatements = statementsFromResults(dataJson.results ?? null);
        setStatements(nextStatements);

        const map: Record<string, CaptureImage[]> = {};
        for (const stmt of capturesJson.statements ?? []) {
          map[stmt.key] = stmt.images ?? [];
        }
        setCapturesByKey(map);
      })
      .catch((e) => {
        if (cancelled) return;
        setDataError(e instanceof Error ? e.message : String(e));
        setStatements([]);
        setCapturesByKey({});
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  const pillItems = React.useMemo(() => {
    const keys = new Set<string>();
    for (const s of statements) keys.add(s.key);
    for (const k of Object.keys(capturesByKey)) keys.add(k);

    const ordered = sortStatementKeys([...keys]);

    return ordered.map((key) => {
      const stmt = statements.find((s) => s.key === key);
      const images = capturesByKey[key] ?? [];
      return {
        key,
        title: stmt?.title,
        tableCount: stmt?.data?.tables?.length ?? 0,
        imageCount: images.length,
        hasError: stmt?.status === "error" || Boolean(stmt?.error),
      };
    });
  }, [statements, capturesByKey]);

  React.useEffect(() => {
    if (pillItems.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !pillItems.some((p) => p.key === selectedKey)) {
      setSelectedKey(pillItems[0].key);
    }
  }, [pillItems, selectedKey]);

  const selectedStatement =
    statements.find((s) => s.key === selectedKey) ?? null;
  const selectedImages = selectedKey ? capturesByKey[selectedKey] ?? [] : [];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-1.5 shadow-sm ring-1 ring-foreground/10 backdrop-blur supports-[backdrop-filter]:bg-card/95">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <CompanyPicker
            companies={companies}
            selectedCompany={selectedCompany}
            onSelectCompany={setSelectedCompany}
            loading={loading}
            error={error}
          />
          <Badge variant="secondary" className="hidden text-[10px] sm:inline-flex">
            {companies.length} total
          </Badge>
          {company?.model ? (
            <Badge variant="secondary" className="hidden text-[10px] md:inline-flex">
              {company.model}
            </Badge>
          ) : null}
          {company ? (
            <span className="hidden truncate text-[11px] text-muted-foreground lg:inline">
              {company.statements.length} stmt
              {company.statements.length === 1 ? "" : "s"}
              {company.generatedAt
                ? ` · generated ${formatDate(company.generatedAt)}`
                : null}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => load()}
            disabled={loading}
            aria-label="Refresh"
            title="Refresh"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <RefreshCw />
            )}
          </Button>
        </div>
      </div>

      <Card className="flex min-w-0 flex-col gap-0 overflow-visible py-0" size="sm">
        {!company ? (
          <CardContent className="py-10 text-center">
            <Database className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-heading text-base font-medium">
              Select a company
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a company to compare extracted tables with report page
              captures side by side.
            </p>
          </CardContent>
        ) : dataLoading ? (
          <CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading comparison data…
          </CardContent>
        ) : dataError ? (
          <CardContent className="py-10 text-center text-sm text-destructive">
            {dataError}
          </CardContent>
        ) : pillItems.length === 0 ? (
          <CardContent className="py-10 text-center">
            <GitCompare className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-heading text-base font-medium">
              No data to compare
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This company has no extracted tables or capture images yet.
            </p>
          </CardContent>
        ) : (
          <CardContent className="flex min-w-0 flex-col gap-0 px-0 py-0">
            <div className="sticky top-[6.25rem] z-10 border-b bg-card/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80">
              <StatementTypePills
                items={pillItems}
                selectedKey={selectedKey}
                onSelect={setSelectedKey}
              />
            </div>

            <div className="grid min-h-[480px] min-w-0 grid-cols-1 gap-0 lg:grid-cols-2 lg:divide-x">
              <section className="flex min-w-0 flex-col border-b lg:border-b-0">
                <header className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                  <GitCompare className="size-4 text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Extracted table
                  </h3>
                </header>
                <div className="min-w-0 flex-1 overflow-auto p-3">
                  {selectedStatement ? (
                    <StatementBlock
                      statement={selectedStatement}
                      compact
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No extracted table for this statement type.
                    </p>
                  )}
                </div>
              </section>

              <section className="flex min-w-0 flex-col">
                <header className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
                  <ImageIcon className="size-4 text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Report capture
                  </h3>
                  {selectedImages.length > 0 ? (
                    <Badge variant="secondary" className="ml-auto text-[10px]">
                      {selectedImages.length} page
                      {selectedImages.length === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </header>
                <div
                  className={cn(
                    "min-w-0 flex-1 overflow-auto p-3",
                    selectedImages.length === 0 &&
                      "flex items-center justify-center",
                  )}
                >
                  {selectedImages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No capture images for this statement type.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {selectedImages.map((img) => (
                        <figure
                          key={img.name}
                          className="overflow-hidden rounded-lg border bg-muted/20 shadow-sm"
                        >
                          <figcaption className="border-b bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                            {img.name}
                          </figcaption>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.url}
                            alt={`Report capture: ${img.name}`}
                            className="block h-auto w-full"
                            loading="lazy"
                          />
                        </figure>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
