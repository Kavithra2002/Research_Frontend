"use client";

import * as React from "react";
import {
  Building2,
  ChevronsUpDown,
  Download,
  ExternalLink,
  FileText,
  Folder,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ReportFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

type Company = {
  name: string;
  reportTypes: Record<string, ReportFile[]>;
  totalReports: number;
};

type ApiResponse = {
  root?: string;
  companies?: Company[];
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

function buildFileUrl(
  company: string,
  type: string,
  file: string,
  download = false,
) {
  const params = new URLSearchParams({ company, type, file });
  if (download) params.set("download", "1");
  return `/api/reports/file?${params.toString()}`;
}

export function ReportsExplorer() {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [selectedCompany, setSelectedCompany] = React.useState<string | null>(
    null,
  );
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [activeType, setActiveType] = React.useState<string | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  const [viewerFullscreen, setViewerFullscreen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", { cache: "no-store" });
      const data = (await res.json()) as ApiResponse;
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
    return companies.filter((c) => c.name.toLowerCase().includes(q));
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

  const reportTypeNames = React.useMemo(() => {
    if (!company) return [] as string[];
    return Object.keys(company.reportTypes).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [company]);

  React.useEffect(() => {
    if (!company) {
      setActiveType(null);
      setSelectedFile(null);
      return;
    }
    if (!activeType || !company.reportTypes[activeType]) {
      const next = reportTypeNames[0] ?? null;
      setActiveType(next);
      setSelectedFile(null);
    }
  }, [company, activeType, reportTypeNames]);

  React.useEffect(() => {
    if (!company || !activeType) return;
    const files = company.reportTypes[activeType] ?? [];
    if (files.length === 0) {
      setSelectedFile(null);
      return;
    }
    if (!selectedFile || !files.some((f) => f.name === selectedFile)) {
      setSelectedFile(files[0].name);
    }
  }, [company, activeType, selectedFile]);

  // Exit fullscreen when the selected file goes away or no report is shown.
  React.useEffect(() => {
    if (!selectedFile && viewerFullscreen) {
      setViewerFullscreen(false);
    }
  }, [selectedFile, viewerFullscreen]);

  // Allow Escape to exit fullscreen.
  React.useEffect(() => {
    if (!viewerFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewerFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerFullscreen]);

  // Reset search when picker closes.
  React.useEffect(() => {
    if (!pickerOpen) setQuery("");
  }, [pickerOpen]);

  const currentFileUrl = React.useMemo(() => {
    if (!company || !activeType || !selectedFile) return null;
    return buildFileUrl(company.name, activeType, selectedFile);
  }, [company, activeType, selectedFile]);

  const triggerLabel = company?.name ?? "Select a company";

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {!viewerFullscreen && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-1.5 shadow-sm ring-1 ring-foreground/10 backdrop-blur supports-[backdrop-filter]:bg-card/95">
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
                          ? "No report companies yet."
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
                              setActiveType(null);
                              setSelectedFile(null);
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
                            <span className="flex-1 truncate" title={c.name}>
                              {c.name}
                            </span>
                            <Badge
                              variant={isActive ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {c.totalReports}
                            </Badge>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </ScrollArea>
              </PopoverContent>
            </Popover>
            <Badge
              variant="secondary"
              className="hidden text-[10px] sm:inline-flex"
            >
              {companies.length} total
            </Badge>
            {company ? (
              <span className="hidden truncate text-[11px] text-muted-foreground lg:inline">
                {company.totalReports} report
                {company.totalReports === 1 ? "" : "s"} across{" "}
                {reportTypeNames.length} type
                {reportTypeNames.length === 1 ? "" : "s"}
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
      )}

      <Card className="flex h-full min-h-0 flex-1 flex-col py-0" size="sm">
        {!company ? (
          <div className="flex h-full flex-1 items-center justify-center p-10 text-center">
            <div className="max-w-sm">
              <FileText className="mx-auto size-8 text-muted-foreground" />
              <h3 className="mt-3 font-heading text-base font-medium">
                Select a company
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the company picker above to browse annual and quarterly
                reports.
              </p>
            </div>
          </div>
        ) : (
          <CardContent
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-3",
              viewerFullscreen ? "p-0" : "py-3",
            )}
          >
            {reportTypeNames.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                No reports available for this company.
              </div>
            ) : (
              <Tabs
                value={activeType ?? reportTypeNames[0]}
                onValueChange={(v) => {
                  setActiveType(v);
                  setSelectedFile(null);
                }}
                className="flex min-h-0 flex-1 flex-col gap-3"
              >
                {!viewerFullscreen && (
                  <TabsList>
                    {reportTypeNames.map((t) => (
                      <TabsTrigger key={t} value={t}>
                        {t}
                        <Badge
                          variant="secondary"
                          className="ml-1 text-[10px]"
                        >
                          {company.reportTypes[t].length}
                        </Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                )}

                {reportTypeNames.map((t) => (
                  <TabsContent
                    key={t}
                    value={t}
                    className={cn(
                      "flex min-h-0 flex-1 flex-col gap-3",
                      !viewerFullscreen && "lg:flex-row",
                    )}
                  >
                    {!viewerFullscreen && (
                      <Card
                        size="sm"
                        className="flex h-full min-h-0 w-full flex-col py-0 lg:max-w-xs"
                      >
                        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
                          {t} reports
                        </div>
                        <ScrollArea className="min-h-0 flex-1">
                          <ul className="flex flex-col gap-1 p-2">
                            {(company.reportTypes[t] ?? []).map((file) => {
                              const isActive =
                                activeType === t &&
                                selectedFile === file.name;
                              return (
                                <li key={file.name}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveType(t);
                                      setSelectedFile(file.name);
                                    }}
                                    className={cn(
                                      "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                                      "hover:bg-muted",
                                      isActive &&
                                        "bg-muted text-foreground",
                                    )}
                                  >
                                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
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
                                          {formatDate(file.modifiedAt)}
                                        </span>
                                      </div>
                                    </div>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
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
                                className="truncate text-sm font-medium"
                                title={selectedFile}
                              >
                                {selectedFile}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {company.name} · {activeType}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <Button
                                variant={
                                  viewerFullscreen ? "default" : "ghost"
                                }
                                size="icon-sm"
                                onClick={() =>
                                  setViewerFullscreen((v) => !v)
                                }
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
                                {viewerFullscreen ? (
                                  <Minimize2 />
                                ) : (
                                  <Maximize2 />
                                )}
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
                                  <a
                                    href={currentFileUrl + "&download=1"}
                                  />
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
                              Select a report
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Pick a {t.toLowerCase()} report from the list to
                              preview it here.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
