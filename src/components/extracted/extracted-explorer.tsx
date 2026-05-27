"use client";

import * as React from "react";
import {
  Building2,
  ChevronsUpDown,
  Database,
  Folder,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import {
  ExtractedTablesView,
  ExtractedStatement,
  statementsFromResults,
} from "./extracted-tables-view";

type ReportFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

type Company = {
  name: string;
  displayName: string;
  statements: string[];
  model: string | null;
  generatedAt: string | null;
  hasReports: boolean;
  reportTypes: Record<string, ReportFile[]>;
  totalReports: number;
};

type ListResponse = {
  root?: string;
  reportsRoot?: string;
  companies?: Company[];
  error?: string;
};

type DataResponse = {
  company?: string;
  meta?: unknown;
  results?: Record<string, unknown>;
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

export function ExtractedExplorer() {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [selectedCompany, setSelectedCompany] = React.useState<string | null>(
    null,
  );
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const [statements, setStatements] = React.useState<ExtractedStatement[]>([]);
  const [dataLoading, setDataLoading] = React.useState(false);
  const [dataError, setDataError] = React.useState<string | null>(null);

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

  const filteredCompanies = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      c.displayName.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q),
    );
  }, [companies, query]);

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
      setDataError(null);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    fetch(
      `/api/extracted/data?company=${encodeURIComponent(selectedCompany)}`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        const json = (await res.json()) as DataResponse;
        if (!res.ok) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        const next = statementsFromResults(json.results ?? null);
        setStatements(next);
      })
      .catch((e) => {
        if (cancelled) return;
        setDataError(e instanceof Error ? e.message : String(e));
        setStatements([]);
      })
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompany]);

  React.useEffect(() => {
    if (!pickerOpen) setQuery("");
  }, [pickerOpen]);

  const triggerLabel = company?.displayName ?? "Select a company";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-1.5 shadow-sm ring-1 ring-foreground/10 backdrop-blur supports-[backdrop-filter]:bg-card/95">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 min-w-0 max-w-[320px] justify-between gap-2 font-normal"
                    aria-label="Choose company"
                  />
                }
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm" title={triggerLabel}>
                    {triggerLabel}
                  </span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={6}
                className="w-(--anchor-width) min-w-[280px] max-w-[360px] p-0"
              >
                <div className="border-b p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search companies..."
                      className="h-9 pl-8"
                      aria-label="Search companies"
                    />
                  </div>
                </div>
                <ScrollArea className="max-h-[320px]">
                  <ul className="flex flex-col gap-0.5 p-1">
                    {loading && companies.length === 0 ? (
                      <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                        Loading companies...
                      </li>
                    ) : null}
                    {error ? (
                      <li className="px-2 py-3 text-xs text-destructive">
                        {error}
                      </li>
                    ) : null}
                    {!loading && filteredCompanies.length === 0 && !error ? (
                      <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                        {companies.length === 0
                          ? "No extracted companies yet."
                          : `No companies match "${query}".`}
                      </li>
                    ) : null}
                    {filteredCompanies.map((c) => {
                      const isActive = c.name === selectedCompany;
                      return (
                        <li key={c.name}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCompany(c.name);
                              setPickerOpen(false);
                            }}
                            className={cn(
                              "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                              "hover:bg-muted",
                              isActive && "bg-muted text-foreground",
                            )}
                          >
                            <Folder
                              className={cn(
                                "size-4 shrink-0 text-muted-foreground",
                                isActive && "text-foreground",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-sm"
                                title={c.displayName}
                              >
                                {c.displayName}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Sparkles className="size-3" />
                                {c.statements.length} stmt
                                {c.statements.length === 1 ? "" : "s"}
                                {c.totalReports > 0 ? (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {c.totalReports} report
                                      {c.totalReports === 1 ? "" : "s"}
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                            <Badge
                              variant={isActive ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {c.statements.length}
                            </Badge>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </ScrollArea>
              </PopoverContent>
            </Popover>
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

      <Card
        className="flex min-w-0 flex-col gap-0 overflow-visible py-0"
        size="sm"
      >
        {!company ? (
          <CardContent className="py-10 text-center">
            <Database className="mx-auto size-8 text-muted-foreground" />
            <h3 className="mt-3 font-heading text-base font-medium">
              Select a company
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the company picker above to browse OpenAI-extracted financial
              statements as tables.
            </p>
          </CardContent>
        ) : (
          <CardContent className="px-0 py-0">
            <ExtractedTablesView
              statements={statements}
              loading={dataLoading}
              error={dataError}
              emptyMessage="No extracted JSON statements found for this company."
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
