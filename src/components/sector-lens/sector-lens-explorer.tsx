"use client";

import * as React from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";

import { cn } from "@/lib/utils";

type SectorLensRow = {
  slug: string;
  name: string;
  sector: string | null;
  sectorDetail: string | null;
  latestYear: number | null;
  reportYears: number[];
  peRatio: number | null;
  revenueT12M: number | null;
  cceLF: number | null;
  marketCap: number | null;
  priceD1: number | null;
  totalReturnYTD: number | null;
};

type SectorLensResponse = {
  asOf?: string;
  universeCount?: number;
  rows?: SectorLensRow[];
  error?: string;
};

type GroupBy = "Securities" | "Sectors";

const TABS = [
  "Overview",
  "Returns",
  "Valuation",
  "Estimates",
  "Actuals",
  "Credit",
  "Technicals",
  "Custom",
  "Results",
] as const;

const NO_DATA = "-";

function fmtNumber(value: number | null): string {
  if (value == null || Number.isNaN(value)) return NO_DATA;
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(2)}k`;
  return value.toFixed(2);
}

function fmtDate(iso?: string): string {
  if (!iso) return NO_DATA;
  try {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(
      d.getDate(),
    ).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export function SectorLensExplorer() {
  const [rows, setRows] = React.useState<SectorLensRow[]>([]);
  const [asOf, setAsOf] = React.useState<string | undefined>(undefined);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [groupBy, setGroupBy] = React.useState<GroupBy>("Sectors");
  const [filter, setFilter] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<(typeof TABS)[number]>(
    "Results",
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sector-lens", { cache: "no-store" });
      const json = (await res.json()) as SectorLensResponse;
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      setRows(json.rows ?? []);
      setAsOf(json.asOf);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.sector ?? "").toLowerCase().includes(q),
    );
  }, [rows, filter]);

  // Group rows for the "Sectors" view, otherwise a single flat list.
  const groups = React.useMemo(() => {
    if (groupBy === "Securities") {
      return [{ label: null as string | null, rows: filtered }];
    }
    const map = new Map<string, SectorLensRow[]>();
    for (const r of filtered) {
      const key = r.sector ?? "Unclassified";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, rs]) => ({ label, rows: rs }));
  }, [filtered, groupBy]);

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white font-mono text-[13px] text-zinc-700 shadow-lg dark:border-amber-900/40 dark:bg-black dark:text-amber-300">
      {/* Title bar */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-100 px-3 py-1.5 dark:border-amber-900/40 dark:bg-[#1a1205]">
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-red-700 px-2 py-0.5 text-[12px] font-semibold text-white">
            Custom Universe (Equity Screener)
          </span>
          <div className="hidden items-center gap-3 text-[12px] text-zinc-500 dark:text-amber-200/80 sm:flex">
            <span className="cursor-default hover:text-zinc-900 dark:hover:text-amber-100">Actions ▾</span>
            <span className="cursor-default hover:text-zinc-900 dark:hover:text-amber-100">Export ▾</span>
            <span className="cursor-default hover:text-zinc-900 dark:hover:text-amber-100">Settings ▾</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-sky-600 md:inline dark:text-sky-300">
            ⤢ Watchlist Analytics
          </span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-sm p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:text-amber-200/80 dark:hover:bg-amber-900/30 dark:hover:text-amber-100"
            aria-label="Refresh"
            title="Refresh"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Refine / Group-by toolbar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[12px] dark:border-amber-900/40 dark:bg-[#0d0a04]">
        <div className="flex items-center gap-2">
          <span className="text-sky-600 dark:text-sky-300">Refine By</span>
          <div className="flex items-center gap-1 rounded-sm border border-zinc-300 bg-white px-2 py-0.5 dark:border-amber-700/60 dark:bg-amber-950/40">
            <Search className="size-3 text-zinc-400 dark:text-amber-400/70" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Countries, Sectors, etc."
              className="w-44 bg-transparent text-[12px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none dark:text-amber-100 dark:placeholder:text-amber-200/40"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sky-600 dark:text-sky-300">Group By</span>
          <div className="inline-flex overflow-hidden rounded-sm border border-zinc-300 dark:border-amber-700/60">
            {(["Securities", "Sectors"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                className={cn(
                  "px-2 py-0.5 text-[12px] transition-colors",
                  groupBy === g
                    ? "bg-amber-600 text-black"
                    : "bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/40",
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <label className="flex cursor-default items-center gap-1.5 text-zinc-500 dark:text-amber-200/70">
          <input type="checkbox" disabled className="accent-amber-600" />
          Show Hi/Lo
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sky-600 dark:text-sky-300">As of</span>
          <span className="rounded-sm bg-zinc-100 px-2 py-0.5 text-zinc-700 dark:bg-amber-950/40 dark:text-amber-100">
            {fmtDate(asOf)}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-x-1 border-b border-zinc-200 bg-zinc-50 px-2 pt-1 text-[12px] dark:border-amber-900/40 dark:bg-[#0d0a04]">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTab(t)}
            className={cn(
              "rounded-t-sm px-2.5 py-1 transition-colors",
              activeTab === t
                ? "bg-white text-zinc-900 ring-1 ring-zinc-300 dark:bg-black dark:text-amber-100 dark:ring-amber-700/50"
                : "text-zinc-500 hover:text-zinc-900 dark:text-amber-200/60 dark:hover:text-amber-100",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-500 dark:text-amber-200/70">
          <Loader2 className="size-4 animate-spin" /> Loading universe…
        </div>
      ) : error ? (
        <div className="px-4 py-10 text-center text-sm text-red-600 dark:text-red-400">{error}</div>
      ) : (
        <ScreenerTable groups={groups} universeCount={rows.length} />
      )}
    </div>
  );
}

function ScreenerTable({
  groups,
  universeCount,
}: {
  groups: { label: string | null; rows: SectorLensRow[] }[];
  universeCount: number;
}) {
  let rowNumber = 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-zinc-200 text-zinc-900 dark:border-amber-900/50 dark:text-amber-100">
            <th className="px-3 py-1.5 text-left font-normal">Name</th>
            <th className="px-3 py-1.5 text-left font-normal">Sector</th>
            <th className="px-3 py-1.5 text-right font-normal">P/E</th>
            <th className="px-3 py-1.5 text-right font-normal">
              Revenue
              <div className="text-[10px] text-zinc-400 dark:text-amber-200/60">T12M</div>
            </th>
            <th className="px-3 py-1.5 text-right font-normal">C&amp;CE LF</th>
            <th className="px-3 py-1.5 text-right font-normal">Market Cap</th>
            <th className="px-3 py-1.5 text-right font-normal">Price:D-1</th>
            <th className="px-3 py-1.5 text-right font-normal">
              Total Return
              <div className="text-[10px] text-zinc-400 dark:text-amber-200/60">YTD</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {/* Investable universe summary row */}
          <tr className="border-b border-zinc-200 bg-zinc-100 font-semibold text-zinc-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-100">
            <td className="px-3 py-1.5" colSpan={2}>
              Investable Universe ({universeCount})
            </td>
            <td className="px-3 py-1.5 text-right">{NO_DATA}</td>
            <td className="px-3 py-1.5 text-right">{NO_DATA}</td>
            <td className="px-3 py-1.5 text-right">{NO_DATA}</td>
            <td className="px-3 py-1.5 text-right">{NO_DATA}</td>
            <td className="px-3 py-1.5 text-right">{NO_DATA}</td>
            <td className="px-3 py-1.5 text-right">{NO_DATA}</td>
          </tr>

          {groups.map((group) => (
            <React.Fragment key={group.label ?? "__all__"}>
              {group.label != null ? (
                <tr className="border-b border-zinc-200 bg-sky-50 text-sky-700 dark:border-amber-900/30 dark:bg-sky-950/30 dark:text-sky-300">
                  <td className="px-3 py-1 text-[11px] uppercase tracking-wide" colSpan={8}>
                    {group.label} ({group.rows.length})
                  </td>
                </tr>
              ) : null}
              {group.rows.map((r) => {
                rowNumber += 1;
                return (
                  <tr
                    key={r.slug}
                    className="border-b border-zinc-100 hover:bg-zinc-50 dark:border-amber-900/15 dark:hover:bg-amber-950/30"
                  >
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className="mr-1.5 text-zinc-400 dark:text-amber-200/40">
                        {rowNumber})
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-amber-200">{r.name}</span>
                      {r.latestYear ? (
                        <span className="ml-2 text-[10px] text-zinc-400 dark:text-amber-200/40">
                          FY{r.latestYear}
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-zinc-500 dark:text-amber-200/80">
                      {r.sector ?? NO_DATA}
                    </td>
                    <td className="px-3 py-1.5 text-right">{fmtNumber(r.peRatio)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {fmtNumber(r.revenueT12M)}
                    </td>
                    <td className="px-3 py-1.5 text-right">{fmtNumber(r.cceLF)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {fmtNumber(r.marketCap)}
                    </td>
                    <td className="px-3 py-1.5 text-right">{fmtNumber(r.priceD1)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {fmtNumber(r.totalReturnYTD)}
                    </td>
                  </tr>
                );
              })}
            </React.Fragment>
          ))}

          {universeCount === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-10 text-center text-zinc-400 dark:text-amber-200/50">
                No companies available yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
