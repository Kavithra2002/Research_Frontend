"use client";

import * as React from "react";
import {
  Building2,
  ChevronsUpDown,
  Folder,
  Hash,
  Search,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type CompanyOption = {
  name: string;
  displayName: string;
  statements: string[];
  totalReports?: number;
  model?: string | null;
  /** CSE stock code root (e.g. COMB), when resolved. */
  ticker?: string | null;
};

type CompanyPickerProps = {
  companies: CompanyOption[];
  selectedCompany: string | null;
  onSelectCompany: (name: string) => void;
  loading?: boolean;
  error?: string | null;
};

export function CompanyPicker({
  companies,
  selectedCompany,
  onSelectCompany,
  loading = false,
  error = null,
}: CompanyPickerProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const company = React.useMemo(
    () => companies.find((c) => c.name === selectedCompany) ?? null,
    [companies, selectedCompany],
  );

  const filteredCompanies = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        (c.ticker?.toLowerCase().includes(q) ?? false),
    );
  }, [companies, query]);

  React.useEffect(() => {
    if (!pickerOpen) setQuery("");
  }, [pickerOpen]);

  const triggerLabel = company?.displayName ?? "Select a company";

  return (
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
        className="w-(--anchor-width) min-w-[280px] max-w-[360px] overflow-hidden bg-popover p-0"
      >
        <div className="border-b bg-popover p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search companies or stock codes..."
              className="h-9 pl-8"
              aria-label="Search companies"
            />
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto overscroll-contain bg-popover">
          <ul className="flex flex-col gap-0.5 p-1">
            {loading && companies.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                Loading companies...
              </li>
            ) : null}
            {error ? (
              <li className="px-2 py-3 text-xs text-destructive">{error}</li>
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
                      onSelectCompany(c.name);
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
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="truncate text-sm"
                          title={c.displayName}
                        >
                          {c.displayName}
                        </span>
                        {c.ticker ? (
                          <Badge
                            variant="outline"
                            className="shrink-0 px-1.5 py-0 text-[10px] font-medium"
                          >
                            {c.ticker}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Sparkles className="size-3" />
                        {c.statements.length} stmt
                        {c.statements.length === 1 ? "" : "s"}
                        {c.totalReports && c.totalReports > 0 ? (
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
        </div>
      </PopoverContent>
    </Popover>
  );
}

type StockCodePickerProps = {
  companies: CompanyOption[];
  selectedCompany: string | null;
  onSelectCompany: (name: string) => void;
  loading?: boolean;
};

/** Searchable picker for CSE stock codes, synced with company selection. */
export function StockCodePicker({
  companies,
  selectedCompany,
  onSelectCompany,
  loading = false,
}: StockCodePickerProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const companiesWithTicker = React.useMemo(
    () =>
      companies
        .filter((c) => Boolean(c.ticker?.trim()))
        .slice()
        .sort((a, b) =>
          (a.ticker ?? "").localeCompare(b.ticker ?? "", undefined, {
            sensitivity: "base",
          }),
        ),
    [companies],
  );

  const company = React.useMemo(
    () => companies.find((c) => c.name === selectedCompany) ?? null,
    [companies, selectedCompany],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companiesWithTicker;
    return companiesWithTicker.filter(
      (c) =>
        (c.ticker?.toLowerCase().includes(q) ?? false) ||
        c.displayName.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q),
    );
  }, [companiesWithTicker, query]);

  React.useEffect(() => {
    if (!pickerOpen) setQuery("");
  }, [pickerOpen]);

  const triggerLabel = company?.ticker?.trim()
    ? company.ticker
    : companiesWithTicker.length === 0
      ? "No stock codes"
      : "Select stock code";

  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-9 min-w-0 max-w-[320px] justify-between gap-2 font-normal"
            aria-label="Choose stock code"
            disabled={!loading && companiesWithTicker.length === 0}
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          <Hash className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm" title={triggerLabel}>
            {triggerLabel}
          </span>
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-(--anchor-width) min-w-[280px] max-w-[360px] overflow-hidden bg-popover p-0"
      >
        <div className="border-b bg-popover p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stock codes..."
              className="h-9 pl-8"
              aria-label="Search stock codes"
            />
          </div>
        </div>
        <div className="max-h-[320px] overflow-y-auto overscroll-contain bg-popover">
          <ul className="flex flex-col gap-0.5 p-1">
            {loading && companiesWithTicker.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                Loading stock codes...
              </li>
            ) : null}
            {!loading && filtered.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                {companiesWithTicker.length === 0
                  ? "No stock codes available for these companies."
                  : `No stock codes match "${query}".`}
              </li>
            ) : null}
            {filtered.map((c) => {
              const isActive = c.name === selectedCompany;
              return (
                <li key={c.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCompany(c.name);
                      setPickerOpen(false);
                    }}
                    className={cn(
                      "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      "hover:bg-muted",
                      isActive && "bg-muted text-foreground",
                    )}
                  >
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className="shrink-0 px-1.5 font-mono text-[11px]"
                    >
                      {c.ticker}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-sm"
                        title={c.displayName}
                      >
                        {c.displayName}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const SUFFIX_NOISE = /\b(PLC|P\.L\.C\.|LTD|LIMITED|INC|CORP|CORPORATION)\b\.?/gi;

function normalizeCompanyName(value: string): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(SUFFIX_NOISE, " ")
    .replace(/[^\w\s&]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreCompanyNames(query: string, candidate: string): number {
  const q = normalizeCompanyName(query);
  const c = normalizeCompanyName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (q.includes(c) || c.includes(q)) return 0.92;

  const qTokens = new Set(q.split(" ").filter(Boolean));
  const cTokens = new Set(c.split(" ").filter(Boolean));
  if (qTokens.size === 0 || cTokens.size === 0) return 0;

  let overlap = 0;
  for (const t of qTokens) if (cTokens.has(t)) overlap += 1;
  const tokenScore = overlap / Math.max(qTokens.size, cTokens.size);

  if (qTokens.size >= 2 && [...qTokens].every((t) => cTokens.has(t))) {
    return Math.max(tokenScore, 0.88);
  }
  return tokenScore;
}

function symbolRoot(symbol: string): string {
  return String(symbol ?? "")
    .trim()
    .toUpperCase()
    .split(".")[0];
}

/**
 * Attach CSE stock-code roots to extracted companies by fuzzy name match.
 */
export function attachTickersToCompanies(
  companies: CompanyOption[],
  cseCompanies: { name: string; symbol: string }[],
  minScore = 0.6,
): CompanyOption[] {
  if (companies.length === 0 || cseCompanies.length === 0) {
    return companies.map((c) => ({ ...c, ticker: c.ticker ?? null }));
  }

  return companies.map((company) => {
    if (company.ticker?.trim()) return company;

    let best: { ticker: string; score: number } | null = null;
    for (const cse of cseCompanies) {
      const score = scoreCompanyNames(company.displayName || company.name, cse.name);
      if (score < minScore) continue;
      if (!best || score > best.score) {
        best = { ticker: symbolRoot(cse.symbol), score };
      }
    }

    return { ...company, ticker: best?.ticker ?? null };
  });
}
