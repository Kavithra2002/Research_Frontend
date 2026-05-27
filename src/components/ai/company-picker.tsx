"use client";

import * as React from "react";
import {
  Building2,
  ChevronsUpDown,
  Folder,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type CompanyOption = {
  name: string;
  displayName: string;
  statements: string[];
  totalReports?: number;
  model?: string | null;
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
        c.name.toLowerCase().includes(q),
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
                      <div className="truncate text-sm" title={c.displayName}>
                        {c.displayName}
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
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
