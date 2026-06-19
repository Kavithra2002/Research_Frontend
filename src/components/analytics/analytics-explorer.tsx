"use client";

import * as React from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  Download,
  FileDown,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Star,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  loadWatchlists,
  makeWatchlistId,
  saveWatchlists,
  type AnalyticsWatchlist,
} from "@/lib/analytics-watchlists";
import {
  toTradeSummaryRow,
} from "@/lib/market-summary-columns";
import { downloadTradeSummaryCsv } from "@/lib/trade-summary-export";
import { downloadWatchlistMarketPdf } from "@/lib/watchlist-market-pdf";

type Watchlist = AnalyticsWatchlist;
import {
  LiveMarketChart,
  type LivePoint,
} from "@/components/analytics/live-market-chart";
import { IndexStatisticsChart } from "@/components/analytics/index-statistics-chart";

// ---------------------------------------------------------------------------
// Types (mirror /api/analytics/live)
// ---------------------------------------------------------------------------

type StockRow = {
  symbol: string;
  ticker: string;
  name: string;
  logoUrl: string | null;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  rangePct: number | null;
  turnover: number | null;
  shareVolume: number | null;
  tradeVolume: number | null;
  marketCap: number | null;
  marketCapPct: number | null;
};

type IndexInfo = {
  value: number | null;
  change: number | null;
  percentage: number | null;
  low: number | null;
  high: number | null;
} | null;

type SectorRow = {
  symbol: string;
  name: string;
  indexName: string;
  value: number | null;
  change: number | null;
  percentage: number | null;
  trades: number | null;
  volume: number | null;
  turnover: number | null;
};

type LivePayload = {
  asOf?: string;
  marketStatus?: string | null;
  indices?: { aspi?: IndexInfo; snp?: IndexInfo };
  summary?: {
    turnover: number | null;
    shareVolume: number | null;
    trades: number | null;
  } | null;
  breadth?: { advancers: number; decliners: number; unchanged: number };
  universe?: StockRow[];
  sectors?: SectorRow[];
  error?: string;
};

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const DASH = "—";

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return DASH;
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtInt(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return DASH;
  return Math.round(v).toLocaleString("en-US");
}

function fmtCompact(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return DASH;
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(2);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return DASH;
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function toneClass(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v) || v === 0) return "text-muted-foreground";
  return v > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// ---------------------------------------------------------------------------
// Screen definitions (filter + default sort, all powered by the live universe)
// ---------------------------------------------------------------------------

type SortDir = "asc" | "desc";

type Screen = {
  id: string;
  label: string;
  filter?: (r: StockRow) => boolean;
  sortKey: string;
  sortDir: SortDir;
};

type ScreenCategory = { id: string; title: string; screens: Screen[] };

function gapPct(r: StockRow): number | null {
  if (r.open == null || r.previousClose == null || r.previousClose === 0)
    return null;
  return ((r.open - r.previousClose) / r.previousClose) * 100;
}

const SCREEN_CATEGORIES: ScreenCategory[] = [
  {
    id: "performance",
    title: "Market performance",
    screens: [
      { id: "all", label: "All stocks", sortKey: "turnover", sortDir: "desc" },
      {
        id: "gainers",
        label: "Top gainers",
        filter: (r) => (r.changePct ?? 0) > 0,
        sortKey: "changePct",
        sortDir: "desc",
      },
      {
        id: "losers",
        label: "Biggest losers",
        filter: (r) => (r.changePct ?? 0) < 0,
        sortKey: "changePct",
        sortDir: "asc",
      },
      {
        id: "active",
        label: "Most active",
        filter: (r) => (r.turnover ?? 0) > 0,
        sortKey: "turnover",
        sortDir: "desc",
      },
      {
        id: "volatile",
        label: "Most volatile",
        filter: (r) => r.rangePct != null,
        sortKey: "rangePct",
        sortDir: "desc",
      },
      {
        id: "unchanged",
        label: "Unchanged",
        filter: (r) => (r.changePct ?? 0) === 0 && (r.shareVolume ?? 0) > 0,
        sortKey: "turnover",
        sortDir: "desc",
      },
    ],
  },
  {
    id: "market-cap",
    title: "Market cap",
    screens: [
      {
        id: "mega",
        label: "Mega-cap (≥100B)",
        filter: (r) => (r.marketCap ?? 0) >= 100e9,
        sortKey: "marketCap",
        sortDir: "desc",
      },
      {
        id: "large",
        label: "Large-cap (25–100B)",
        filter: (r) => (r.marketCap ?? 0) >= 25e9 && (r.marketCap ?? 0) < 100e9,
        sortKey: "marketCap",
        sortDir: "desc",
      },
      {
        id: "mid",
        label: "Mid-cap (5–25B)",
        filter: (r) => (r.marketCap ?? 0) >= 5e9 && (r.marketCap ?? 0) < 25e9,
        sortKey: "marketCap",
        sortDir: "desc",
      },
      {
        id: "small",
        label: "Small-cap (1–5B)",
        filter: (r) => (r.marketCap ?? 0) >= 1e9 && (r.marketCap ?? 0) < 5e9,
        sortKey: "marketCap",
        sortDir: "desc",
      },
      {
        id: "micro",
        label: "Micro-cap (<1B)",
        filter: (r) => (r.marketCap ?? 0) > 0 && (r.marketCap ?? 0) < 1e9,
        sortKey: "marketCap",
        sortDir: "desc",
      },
    ],
  },
  {
    id: "price",
    title: "Price levels",
    screens: [
      {
        id: "expensive",
        label: "Most expensive",
        filter: (r) => (r.price ?? 0) > 0,
        sortKey: "price",
        sortDir: "desc",
      },
      {
        id: "high-priced",
        label: "High priced (≥Rs 500)",
        filter: (r) => (r.price ?? 0) >= 500,
        sortKey: "price",
        sortDir: "desc",
      },
      {
        id: "penny",
        label: "Penny stocks (<Rs 10)",
        filter: (r) => (r.price ?? 0) > 0 && (r.price ?? 0) < 10,
        sortKey: "turnover",
        sortDir: "desc",
      },
      {
        id: "near-high",
        label: "Near day high",
        filter: (r) =>
          r.price != null &&
          r.high != null &&
          r.high > 0 &&
          r.price >= r.high * 0.99,
        sortKey: "changePct",
        sortDir: "desc",
      },
      {
        id: "near-low",
        label: "Near day low",
        filter: (r) =>
          r.price != null &&
          r.low != null &&
          r.low > 0 &&
          r.price <= r.low * 1.01,
        sortKey: "changePct",
        sortDir: "asc",
      },
    ],
  },
  {
    id: "liquidity",
    title: "Liquidity & trading",
    screens: [
      {
        id: "turnover",
        label: "Highest turnover",
        filter: (r) => (r.turnover ?? 0) > 0,
        sortKey: "turnover",
        sortDir: "desc",
      },
      {
        id: "volume",
        label: "Highest volume",
        filter: (r) => (r.shareVolume ?? 0) > 0,
        sortKey: "shareVolume",
        sortDir: "desc",
      },
      {
        id: "trades",
        label: "Most trades",
        filter: (r) => (r.tradeVolume ?? 0) > 0,
        sortKey: "tradeVolume",
        sortDir: "desc",
      },
      {
        id: "gap-up",
        label: "Gap up",
        filter: (r) => (gapPct(r) ?? 0) > 0,
        sortKey: "gap",
        sortDir: "desc",
      },
      {
        id: "gap-down",
        label: "Gap down",
        filter: (r) => (gapPct(r) ?? 0) < 0,
        sortKey: "gap",
        sortDir: "asc",
      },
    ],
  },
];

const ALL_SCREENS = SCREEN_CATEGORIES.flatMap((c) => c.screens);

// ---------------------------------------------------------------------------

function stockToTradeSummary(r: StockRow) {
  return toTradeSummaryRow({
    name: r.name,
    symbol: r.symbol,
    shareVolume: r.shareVolume,
    tradeVolume: r.tradeVolume,
    previousClose: r.previousClose,
    open: r.open,
    high: r.high,
    low: r.low,
    price: r.price,
    change: r.change,
    changePct: r.changePct,
  });
}

function downloadWatchlistCsv(watchlist: Watchlist, universe: StockRow[]) {
  if (typeof window === "undefined") return;
  const set = new Set(watchlist.symbols);
  const rows = universe.filter((r) => set.has(r.symbol)).map(stockToTradeSummary);
  downloadTradeSummaryCsv(watchlist.name, rows);
}

function downloadWatchlistPdf(
  watchlist: Watchlist,
  universe: StockRow[],
  asOf?: string | null,
) {
  const set = new Set(watchlist.symbols);
  const rows = universe.filter((r) => set.has(r.symbol)).map(stockToTradeSummary);
  downloadWatchlistMarketPdf(watchlist.name, rows, asOf);
}

// ---------------------------------------------------------------------------
// Column / view definitions
// ---------------------------------------------------------------------------

type Column = {
  key: string;
  label: string;
  align?: "left" | "right";
  value: (r: StockRow, ctx: { totalTurnover: number }) => number | null;
  render: (r: StockRow, ctx: { totalTurnover: number }) => React.ReactNode;
};

const COMPANY_COL: Column = {
  key: "name",
  label: "Company",
  align: "left",
  value: () => null,
  render: (r) => <CompanyCell row={r} />,
};

function avgTradeSize(r: StockRow): number | null {
  if (r.turnover == null || !r.tradeVolume) return null;
  return r.turnover / r.tradeVolume;
}

function turnoverShare(r: StockRow, total: number): number | null {
  if (r.turnover == null || total <= 0) return null;
  return (r.turnover / total) * 100;
}

const VIEWS: { id: string; label: string; columns: Column[] }[] = [
  {
    id: "overview",
    label: "Overview",
    columns: [
      COMPANY_COL,
      {
        key: "symbol",
        label: "Symbol",
        align: "left",
        value: () => null,
        render: (r) => (
          <span className="font-mono text-xs text-muted-foreground">{r.symbol}</span>
        ),
      },
      {
        key: "shareVolume",
        label: "Share Volume",
        align: "right",
        value: (r) => r.shareVolume,
        render: (r) => fmtInt(r.shareVolume),
      },
      {
        key: "tradeVolume",
        label: "Trades",
        align: "right",
        value: (r) => r.tradeVolume,
        render: (r) => fmtInt(r.tradeVolume),
      },
      {
        key: "previousClose",
        label: "Prev close",
        align: "right",
        value: (r) => r.previousClose,
        render: (r) => fmtNum(r.previousClose),
      },
      {
        key: "open",
        label: "Open",
        align: "right",
        value: (r) => r.open,
        render: (r) => fmtNum(r.open),
      },
      {
        key: "high",
        label: "High",
        align: "right",
        value: (r) => r.high,
        render: (r) => fmtNum(r.high),
      },
      {
        key: "low",
        label: "Low",
        align: "right",
        value: (r) => r.low,
        render: (r) => fmtNum(r.low),
      },
      {
        key: "price",
        label: "Last",
        align: "right",
        value: (r) => r.price,
        render: (r) => fmtNum(r.price),
      },
      {
        key: "change",
        label: "Change",
        align: "right",
        value: (r) => r.change,
        render: (r) => (
          <span className={toneClass(r.change)}>
            {r.change == null ? DASH : `${r.change > 0 ? "+" : ""}${fmtNum(r.change)}`}
          </span>
        ),
      },
      {
        key: "changePct",
        label: "Chg %",
        align: "right",
        value: (r) => r.changePct,
        render: (r) => <ChangeBadge value={r.changePct} />,
      },
    ],
  },
  {
    id: "performance",
    label: "Performance",
    columns: [
      COMPANY_COL,
      {
        key: "open",
        label: "Open",
        align: "right",
        value: (r) => r.open,
        render: (r) => fmtNum(r.open),
      },
      {
        key: "high",
        label: "High",
        align: "right",
        value: (r) => r.high,
        render: (r) => fmtNum(r.high),
      },
      {
        key: "low",
        label: "Low",
        align: "right",
        value: (r) => r.low,
        render: (r) => fmtNum(r.low),
      },
      {
        key: "price",
        label: "Last",
        align: "right",
        value: (r) => r.price,
        render: (r) => fmtNum(r.price),
      },
      {
        key: "previousClose",
        label: "Prev close",
        align: "right",
        value: (r) => r.previousClose,
        render: (r) => fmtNum(r.previousClose),
      },
      {
        key: "rangePct",
        label: "Day range %",
        align: "right",
        value: (r) => r.rangePct,
        render: (r) => (r.rangePct == null ? DASH : `${r.rangePct.toFixed(2)}%`),
      },
      {
        key: "changePct",
        label: "Chg %",
        align: "right",
        value: (r) => r.changePct,
        render: (r) => <ChangeBadge value={r.changePct} />,
      },
    ],
  },
  {
    id: "liquidity",
    label: "Liquidity",
    columns: [
      COMPANY_COL,
      {
        key: "shareVolume",
        label: "Share volume",
        align: "right",
        value: (r) => r.shareVolume,
        render: (r) => fmtCompact(r.shareVolume),
      },
      {
        key: "tradeVolume",
        label: "Trades",
        align: "right",
        value: (r) => r.tradeVolume,
        render: (r) => fmtInt(r.tradeVolume),
      },
      {
        key: "turnover",
        label: "Turnover (Rs)",
        align: "right",
        value: (r) => r.turnover,
        render: (r) => fmtCompact(r.turnover),
      },
      {
        key: "share",
        label: "% of mkt turnover",
        align: "right",
        value: (r, ctx) => turnoverShare(r, ctx.totalTurnover),
        render: (r, ctx) => {
          const v = turnoverShare(r, ctx.totalTurnover);
          return v == null ? DASH : `${v.toFixed(2)}%`;
        },
      },
      {
        key: "avgTrade",
        label: "Avg trade (Rs)",
        align: "right",
        value: (r) => avgTradeSize(r),
        render: (r) => fmtCompact(avgTradeSize(r)),
      },
    ],
  },
  {
    id: "size",
    label: "Size & valuation",
    columns: [
      COMPANY_COL,
      {
        key: "marketCap",
        label: "Market cap (Rs)",
        align: "right",
        value: (r) => r.marketCap,
        render: (r) => fmtCompact(r.marketCap),
      },
      {
        key: "marketCapPct",
        label: "% of market",
        align: "right",
        value: (r) => r.marketCapPct,
        render: (r) =>
          r.marketCapPct == null ? DASH : `${r.marketCapPct.toFixed(2)}%`,
      },
      {
        key: "price",
        label: "Price",
        align: "right",
        value: (r) => r.price,
        render: (r) => fmtNum(r.price),
      },
      {
        key: "changePct",
        label: "Chg %",
        align: "right",
        value: (r) => r.changePct,
        render: (r) => <ChangeBadge value={r.changePct} />,
      },
      {
        key: "turnover",
        label: "Turnover",
        align: "right",
        value: (r) => r.turnover,
        render: (r) => fmtCompact(r.turnover),
      },
    ],
  },
];

// Sort accessors that aren't direct columns (used by screens).
const SORT_ACCESSORS: Record<string, (r: StockRow) => number | null> = {
  turnover: (r) => r.turnover,
  changePct: (r) => r.changePct,
  change: (r) => r.change,
  rangePct: (r) => r.rangePct,
  marketCap: (r) => r.marketCap,
  marketCapPct: (r) => r.marketCapPct,
  price: (r) => r.price,
  shareVolume: (r) => r.shareVolume,
  tradeVolume: (r) => r.tradeVolume,
  open: (r) => r.open,
  high: (r) => r.high,
  low: (r) => r.low,
  previousClose: (r) => r.previousClose,
  gap: (r) => gapPct(r),
  avgTrade: (r) => avgTradeSize(r),
  name: () => null,
};

const REFRESH_MS = 30_000;
const VISIBLE_TABLE_ROWS = 15;
const TABLE_ROW_HEIGHT_PX = 41;

type SessionChartHistory = {
  date: string;
  aspi: LivePoint[];
  snp: LivePoint[];
  stocks: Record<string, LivePoint[]>;
};

const CHART_STORAGE_KEY = "analytics-live-chart-v1";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isMarketOpen(status: string | null | undefined): boolean {
  const s = status ?? "";
  if (/clos/i.test(s)) return false;
  // CSE reports "Regular Trading", "Pre Open", "Open", "Trade Close" etc.
  return /open|regular|trading|trade/i.test(s);
}

function loadSessionChart(): SessionChartHistory {
  const empty: SessionChartHistory = {
    date: todayKey(),
    aspi: [],
    snp: [],
    stocks: {},
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = sessionStorage.getItem(CHART_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as SessionChartHistory;
    if (parsed.date !== todayKey()) return empty;
    return {
      date: parsed.date,
      aspi: Array.isArray(parsed.aspi) ? parsed.aspi : [],
      snp: Array.isArray(parsed.snp) ? parsed.snp : [],
      stocks:
        parsed.stocks && typeof parsed.stocks === "object" ? parsed.stocks : {},
    };
  } catch {
    return empty;
  }
}

function saveSessionChart(history: SessionChartHistory) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CHART_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore quota errors
  }
}

function appendPoint(series: LivePoint[], value: number, time: number): LivePoint[] {
  const last = series[series.length - 1];
  if (last && last.value === value && time - last.time < 25_000) return series;
  return [...series, { time, value }].slice(-720);
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function ChangeBadge({ value }: { value: number | null }) {
  if (value == null || Number.isNaN(value)) {
    return <span className="text-muted-foreground">{DASH}</span>;
  }
  const up = value > 0;
  const flat = value === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
        flat && "bg-muted text-muted-foreground",
        up && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        !up && !flat && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
      )}
    >
      {up ? (
        <TrendingUp className="size-3" />
      ) : flat ? null : (
        <TrendingDown className="size-3" />
      )}
      {fmtPct(value)}
    </span>
  );
}

function CompanyCell({ row }: { row: StockRow }) {
  const [broken, setBroken] = React.useState(false);
  const hue = hashHue(row.ticker || row.symbol);
  const initials = (row.ticker || row.symbol).slice(0, 2).toUpperCase();
  return (
    <div className="flex items-center gap-2.5">
      {row.logoUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.logoUrl}
          alt={row.ticker}
          width={26}
          height={26}
          onError={() => setBroken(true)}
          className="size-6.5 shrink-0 rounded-full bg-white object-contain ring-1 ring-black/5"
        />
      ) : (
        <span
          className="flex size-6.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ring-1 ring-black/5"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))`,
          }}
        >
          {initials}
        </span>
      )}
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-sm font-semibold text-foreground">
          {row.ticker}
        </span>
        <span className="max-w-[200px] truncate text-[11px] text-muted-foreground">
          {row.name}
        </span>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: number | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border bg-card px-3 py-2">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
      {sub ? (
        <span className={cn("text-xs font-medium tabular-nums", toneClass(tone))}>
          {sub}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnalyticsExplorer() {
  const [data, setData] = React.useState<LivePayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = React.useState(true);

  const [screenId, setScreenId] = React.useState<string>(ALL_SCREENS[0].id);
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<{ key: string; dir: SortDir }>({
    key: ALL_SCREENS[0].sortKey,
    dir: ALL_SCREENS[0].sortDir,
  });
  const [selectedSymbol, setSelectedSymbol] = React.useState<string | null>(
    null,
  );
  const [hover, setHover] = React.useState<{
    symbol: string;
    left: number;
    top: number;
  } | null>(null);
  const [watchlists, setWatchlists] = React.useState<Watchlist[]>([]);
  const [activeWatchlistId, setActiveWatchlistId] = React.useState<
    string | null
  >(null);
  const [watchlistManagerOpen, setWatchlistManagerOpen] = React.useState(false);
  const [chartHistory, setChartHistory] = React.useState<SessionChartHistory>(() => ({
    date: todayKey(),
    aspi: [],
    snp: [],
    stocks: {},
  }));

  const load = React.useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/analytics/live", { cache: "no-store" });
      const json = (await res.json()) as LivePayload;
      if (!res.ok || json.error) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
      }
      setData(json);
      setUpdatedAt(new Date());
      setError(null);

      if (isMarketOpen(json.marketStatus)) {
        const now = Date.now();
        setChartHistory((prev) => {
          const base =
            prev.date === todayKey()
              ? prev
              : { date: todayKey(), aspi: [], snp: [], stocks: {} };
          const next: SessionChartHistory = {
            ...base,
            aspi: base.aspi,
            snp: base.snp,
            stocks: { ...base.stocks },
          };
          const aspiVal = json.indices?.aspi?.value;
          if (aspiVal != null) {
            let aspiSeries = base.aspi;
            if (aspiSeries.length === 0) {
              const chg = json.indices?.aspi?.change;
              if (chg != null) {
                aspiSeries = [{ time: now - 60_000, value: aspiVal - chg }];
              }
            }
            next.aspi = appendPoint(aspiSeries, aspiVal, now);
          }
          const snpVal = json.indices?.snp?.value;
          if (snpVal != null) {
            let snpSeries = base.snp;
            if (snpSeries.length === 0) {
              const chg = json.indices?.snp?.change;
              if (chg != null) {
                snpSeries = [{ time: now - 60_000, value: snpVal - chg }];
              }
            }
            next.snp = appendPoint(snpSeries, snpVal, now);
          }
          saveSessionChart(next);
          return next;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void load(true);
  }, [load]);

  React.useEffect(() => {
    setChartHistory(loadSessionChart());
  }, []);

  React.useEffect(() => {
    setWatchlists(loadWatchlists());
  }, []);

  const updateWatchlists = React.useCallback(
    (next: Watchlist[] | ((prev: Watchlist[]) => Watchlist[])) => {
      setWatchlists((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        saveWatchlists(resolved);
        return resolved;
      });
    },
    [],
  );

  React.useEffect(() => {
    if (!selectedSymbol || !data || !isMarketOpen(data.marketStatus)) return;
    const row = data.universe?.find((r) => r.symbol === selectedSymbol);
    if (row?.price == null) return;
    const now = Date.now();
    setChartHistory((prev) => {
      const base =
        prev.date === todayKey()
          ? prev
          : { date: todayKey(), aspi: [], snp: [], stocks: {} };
      let existing = base.stocks[selectedSymbol] ?? [];
      if (existing.length === 0 && row.previousClose != null) {
        existing = [{ time: now - 60_000, value: row.previousClose }];
      }
      const nextStocks = {
        ...base.stocks,
        [selectedSymbol]: appendPoint(existing, row.price!, now),
      };
      const next = { ...base, stocks: nextStocks };
      saveSessionChart(next);
      return next;
    });
  }, [selectedSymbol, data]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => void load(false), REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const screen = React.useMemo(
    () => ALL_SCREENS.find((s) => s.id === screenId) ?? ALL_SCREENS[0],
    [screenId],
  );
  const view = VIEWS[0];

  const universe = data?.universe ?? [];

  const totalTurnover = React.useMemo(
    () => universe.reduce((sum, r) => sum + (r.turnover ?? 0), 0),
    [universe],
  );

  const selectScreen = React.useCallback((s: Screen) => {
    setActiveWatchlistId(null);
    setScreenId(s.id);
    setSort({ key: s.sortKey, dir: s.sortDir });
  }, []);

  const activeWatchlist = React.useMemo(
    () => watchlists.find((w) => w.id === activeWatchlistId) ?? null,
    [watchlists, activeWatchlistId],
  );

  const selectWatchlist = React.useCallback((id: string) => {
    setActiveWatchlistId(id);
    setSort({ key: "turnover", dir: "desc" });
  }, []);

  const toggleSort = React.useCallback((key: string) => {
    if (key === "name") return;
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" },
    );
  }, []);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = universe;
    if (activeWatchlist) {
      const set = new Set(activeWatchlist.symbols);
      list = list.filter((r) => set.has(r.symbol));
    } else if (screen.filter) {
      list = list.filter(screen.filter);
    }
    if (q) {
      list = list.filter(
        (r) =>
          r.ticker.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.symbol.toLowerCase().includes(q),
      );
    }
    const accessor = SORT_ACCESSORS[sort.key] ?? SORT_ACCESSORS.turnover;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });
  }, [universe, screen, query, sort, activeWatchlist]);

  const selectedRow = React.useMemo(
    () => universe.find((r) => r.symbol === selectedSymbol) ?? null,
    [universe, selectedSymbol],
  );

  const hoverRow = React.useMemo(
    () => (hover ? (universe.find((r) => r.symbol === hover.symbol) ?? null) : null),
    [universe, hover],
  );

  const handleRowEnter = React.useCallback(
    (symbol: string, el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const CARD_W = 340;
      const CARD_H = 250;
      let left = rect.right + 12;
      if (left + CARD_W > window.innerWidth - 8) {
        left = rect.left - CARD_W - 12;
      }
      if (left < 8) left = Math.max(8, window.innerWidth - CARD_W - 8);
      let top = Math.min(rect.top, window.innerHeight - CARD_H - 12);
      top = Math.max(8, top);
      setHover({ symbol, left, top });
    },
    [],
  );

  const activeChart = React.useMemo(() => {
    if (!selectedSymbol || !selectedRow) return null;
    const stored = chartHistory.stocks[selectedSymbol] ?? [];
    const points =
      stored.length > 0
        ? stored
        : selectedRow.price != null
          ? [{ time: Date.now(), value: selectedRow.price }]
          : [];
    return {
      title: selectedRow.ticker,
      subtitle: selectedRow.name,
      points,
      reference: selectedRow.previousClose ?? null,
    };
  }, [chartHistory, selectedRow, selectedSymbol]);

  const marketOpen = isMarketOpen(data?.marketStatus);

  const breadth = data?.breadth ?? { advancers: 0, decliners: 0, unchanged: 0 };
  const breadthTotal =
    breadth.advancers + breadth.decliners + breadth.unchanged || 1;

  return (
    <div className="flex flex-col gap-4">
      {/* Market summary strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="ASPI"
          value={fmtNum(data?.indices?.aspi?.value)}
          sub={fmtPct(data?.indices?.aspi?.percentage)}
          tone={data?.indices?.aspi?.percentage}
        />
        <StatCard
          label="S&P SL20"
          value={fmtNum(data?.indices?.snp?.value)}
          sub={fmtPct(data?.indices?.snp?.percentage)}
          tone={data?.indices?.snp?.percentage}
        />
        <StatCard
          label="Turnover (Rs)"
          value={fmtCompact(data?.summary?.turnover)}
        />
        <StatCard
          label="Volume"
          value={fmtCompact(data?.summary?.shareVolume)}
        />
        <StatCard label="Trades" value={fmtInt(data?.summary?.trades)} />
        <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-3 py-2">
          <div className="flex items-center justify-between text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            <span>Breadth</span>
            <Badge
              variant={
                isMarketOpen(data?.marketStatus) ? "default" : "secondary"
              }
              className="h-4 px-1.5 text-[9px]"
            >
              {data?.marketStatus ?? "—"}
            </Badge>
          </div>
          <div className="mt-0.5 flex h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="bg-emerald-500"
              style={{ width: `${(breadth.advancers / breadthTotal) * 100}%` }}
            />
            <div
              className="bg-zinc-400 dark:bg-zinc-600"
              style={{ width: `${(breadth.unchanged / breadthTotal) * 100}%` }}
            />
            <div
              className="bg-rose-500"
              style={{ width: `${(breadth.decliners / breadthTotal) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">
              ▲ {breadth.advancers}
            </span>
            <span className="text-muted-foreground">● {breadth.unchanged}</span>
            <span className="text-rose-600 dark:text-rose-400">
              ▼ {breadth.decliners}
            </span>
          </div>
        </div>
      </div>

      {/* Sector heatmap */}
      <SectorStrip sectors={data?.sectors ?? []} loading={loading} />

      {/* Results */}
      <Card size="sm" className="py-0">
        {/* Live controls */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-b px-4 py-2.5">
          <span className="mr-auto text-xs text-muted-foreground">
            <span className="text-foreground">{rows.length}</span> of{" "}
            {universe.length}
          </span>
          <Button
            variant={autoRefresh ? "secondary" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
            title="Toggle auto-refresh (30s)"
          >
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                autoRefresh
                  ? "animate-pulse bg-emerald-500"
                  : "bg-muted-foreground",
              )}
            />
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => void load(false)}
            disabled={refreshing}
            aria-label="Refresh"
            title="Refresh now"
          >
            {refreshing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
        </div>

        {/* Live intraday charts — CSE-style statistics panels */}
        <div className="px-4 pb-4">
          {selectedSymbol && selectedRow && activeChart ? (
            <LiveMarketChart
              statisticsTitle={`${selectedRow.ticker} Statistics`}
              title={activeChart.title}
              subtitle={`${activeChart.subtitle} · intraday`}
              points={activeChart.points}
              marketOpen={marketOpen}
              reference={activeChart.reference}
              loading={loading}
              onRefresh={() => void load(false)}
              refreshing={refreshing}
            />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <IndexStatisticsChart
                  chartId={1}
                  statisticsTitle="ASPI Statistics"
                  indexLabel="ASPI"
                  subtitle="All Share Price Index · intraday"
                  liveValue={data?.indices?.aspi?.value ?? null}
                  liveChangePct={data?.indices?.aspi?.percentage ?? null}
                  marketOpen={marketOpen}
                  onRefresh={() => void load(false)}
                  refreshing={refreshing}
                />
                <IndexStatisticsChart
                  chartId={40}
                  statisticsTitle="S&P SL20 Statistics"
                  indexLabel="S&P SL20"
                  subtitle="Colombo Stock Exchange · intraday"
                  liveValue={data?.indices?.snp?.value ?? null}
                  liveChangePct={data?.indices?.snp?.percentage ?? null}
                  marketOpen={marketOpen}
                  onRefresh={() => void load(false)}
                  refreshing={refreshing}
                />
              </div>
              <p className="pt-2 text-center text-[10px] text-rose-600 dark:text-rose-400">
                * The Total Return values are computed and updated only after
                Market Close each day.
              </p>
            </>
          )}
        </div>

        {/* Screen picker — below charts */}
        <div className="border-t">
          <div className="px-4 pt-4">
            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or symbol..."
                className="pl-8"
                aria-label="Search stocks"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 p-4 md:grid-cols-3 lg:grid-cols-4">
            {SCREEN_CATEGORIES.map((cat) => (
              <div key={cat.id} className="flex flex-col gap-2">
                <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {cat.title}
                </div>
                <ul className="flex flex-col gap-1">
                  {cat.screens.map((s) => {
                    const isActive = s.id === screenId;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => selectScreen(s)}
                          className={cn(
                            "w-full rounded-md text-left text-sm transition-colors",
                            "text-foreground/80 hover:text-foreground",
                            isActive &&
                              "font-medium text-primary hover:text-primary",
                          )}
                        >
                          {s.label}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {/* My lists — custom watchlists + manager */}
          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              <Star className="size-3.5" />
              My lists
            </span>
            {watchlists.length === 0 ? (
              <span className="text-xs text-muted-foreground/70">
                No lists yet — create one
              </span>
            ) : (
              watchlists.map((w) => {
                const isActive = w.id === activeWatchlistId;
                return (
                  <div
                    key={w.id}
                    className={cn(
                      "flex items-stretch divide-x overflow-hidden rounded-full border text-xs transition-colors",
                      isActive
                        ? "divide-primary/30 border-primary/40"
                        : "divide-border",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => selectWatchlist(w.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 transition-colors",
                        isActive
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground/80 hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      {w.name}
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-[10px] tabular-nums",
                          isActive
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {w.symbols.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadWatchlistCsv(w, universe)}
                      className="flex items-center justify-center bg-muted/40 px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={`Download ${w.name} trade summary CSV`}
                      title="Download CSV"
                    >
                      <Download className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadWatchlistPdf(w, universe, data?.asOf)
                      }
                      className="flex items-center justify-center bg-muted/40 px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={`Download ${w.name} market summary PDF`}
                      title="Download PDF"
                    >
                      <FileDown className="size-3" />
                    </button>
                  </div>
                );
              })
            )}
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setWatchlistManagerOpen(true)}
              aria-label="Manage watchlists"
              title="Create / manage your company lists"
            >
              Set up
              <Settings2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Table — first 15 rows visible, rest scroll */}
        <div className="px-4 pb-2">
          <div
            className="overflow-auto rounded-lg border bg-card"
            style={{ maxHeight: VISIBLE_TABLE_ROWS * TABLE_ROW_HEIGHT_PX + 44 }}
          >
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                <tr className="border-b">
                  <th className="w-10 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    #
                  </th>
                  {view.columns.map((col) => {
                    const sortable = col.key !== "name";
                    const active = sort.key === col.key;
                    return (
                      <th
                        key={col.key}
                        className={cn(
                          "px-3 py-2 text-xs font-medium text-muted-foreground select-none",
                          col.align === "right" ? "text-right" : "text-left",
                          sortable && "cursor-pointer hover:text-foreground",
                        )}
                        onClick={() => sortable && toggleSort(col.key)}
                      >
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            col.align === "right" && "flex-row-reverse",
                            active && "text-foreground",
                          )}
                        >
                          {col.label}
                          {sortable ? (
                            active ? (
                              sort.dir === "desc" ? (
                                <ArrowDown className="size-3" />
                              ) : (
                                <ArrowUp className="size-3" />
                              )
                            ) : (
                              <ChevronsUpDown className="size-3 opacity-40" />
                            )
                          ) : null}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                  {loading ? (
                    <SkeletonRows cols={view.columns.length + 1} />
                  ) : error ? (
                    <tr>
                      <td
                        colSpan={view.columns.length + 1}
                        className="h-40 text-center text-sm text-rose-600 dark:text-rose-400"
                      >
                        {error}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={view.columns.length + 1}
                        className="h-40 text-center"
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Activity className="size-5 text-muted-foreground/50" />
                          <span className="text-sm text-muted-foreground">
                            No stocks match this screen
                          </span>
                          <span className="text-xs text-muted-foreground/70">
                            Try a different filter or clear the search
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr
                        key={r.symbol}
                        onClick={() => setSelectedSymbol(r.symbol)}
                        onMouseEnter={(e) =>
                          handleRowEnter(r.symbol, e.currentTarget)
                        }
                        onMouseLeave={() =>
                          setHover((h) => (h?.symbol === r.symbol ? null : h))
                        }
                        className={cn(
                          "cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50",
                          selectedSymbol === r.symbol && "bg-muted/60",
                        )}
                      >
                        <td className="w-10 px-3 py-2 text-xs tabular-nums text-muted-foreground">
                          {i + 1}
                        </td>
                        {view.columns.map((col) => (
                          <td
                            key={col.key}
                            className={cn(
                              "px-3 py-2 tabular-nums whitespace-nowrap",
                              col.align === "right"
                                ? "text-right"
                                : "text-left",
                            )}
                          >
                            {col.render(r, { totalTurnover })}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
              </tbody>
            </table>
          </div>
          {!loading && rows.length > VISIBLE_TABLE_ROWS ? (
            <p className="mt-1.5 text-center text-[11px] text-muted-foreground">
              Showing top {VISIBLE_TABLE_ROWS} rows — scroll for{" "}
              {rows.length - VISIBLE_TABLE_ROWS} more
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span>
            Showing <span className="text-foreground">{view.label}</span> ·
            Filter:{" "}
            <span className="text-foreground">
              {activeWatchlist ? `★ ${activeWatchlist.name}` : screen.label}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            {refreshing ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
            )}
            Live CSE feed
            {updatedAt
              ? ` · updated ${updatedAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : ""}
          </span>
        </div>
      </Card>

      {hover && hoverRow ? (
        <FinancialHoverCard row={hoverRow} left={hover.left} top={hover.top} />
      ) : null}

      <CompanyDetailDialog
        symbol={selectedSymbol}
        fallback={selectedRow}
        onClose={() => setSelectedSymbol(null)}
      />

      <WatchlistManagerDialog
        open={watchlistManagerOpen}
        onOpenChange={setWatchlistManagerOpen}
        universe={universe}
        watchlists={watchlists}
        onChange={updateWatchlists}
        onDeletedActive={(deletedId) => {
          setActiveWatchlistId((cur) => (cur === deletedId ? null : cur));
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sector strip
// ---------------------------------------------------------------------------

function SectorStrip({
  sectors,
  loading,
}: {
  sectors: SectorRow[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-12 w-28 shrink-0 animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    );
  }
  if (sectors.length === 0) return null;
  const sorted = [...sectors].sort(
    (a, b) => (b.percentage ?? 0) - (a.percentage ?? 0),
  );
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {sorted.map((s) => {
        const pct = s.percentage ?? 0;
        return (
          <div
            key={s.symbol || s.name}
            className={cn(
              "flex min-w-[120px] shrink-0 flex-col gap-0.5 rounded-lg border px-3 py-2",
              pct > 0
                ? "border-emerald-500/30 bg-emerald-500/5"
                : pct < 0
                  ? "border-rose-500/30 bg-rose-500/5"
                  : "bg-card",
            )}
            title={s.indexName}
          >
            <span className="truncate text-xs font-medium text-foreground">
              {s.name}
            </span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {fmtNum(s.value)}
            </span>
            <span
              className={cn(
                "text-[11px] font-medium tabular-nums",
                toneClass(pct),
              )}
            >
              {fmtPct(pct)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton rows
// ---------------------------------------------------------------------------

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 10 }).map((_, r) => (
        <tr key={r} className="border-b border-border/60">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-3 py-2.5">
              <div
                className={cn(
                  "h-4 animate-pulse rounded bg-muted",
                  c === 1 ? "w-32" : "w-14",
                  c === 0 && "w-6",
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Financial Highlights hover banner
// ---------------------------------------------------------------------------

// Beta values are not part of the live universe feed; they come from the
// per-company endpoint. Cache per symbol so repeated hovers don't refetch.
const betaCache = new Map<string, { asi: number | null; spsl: number | null }>();

function HoverStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-muted/30 px-2.5 py-1.5">
      <span className="text-[9px] leading-tight tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-xs font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function FinancialHoverCard({
  row,
  left,
  top,
}: {
  row: StockRow;
  left: number;
  top: number;
}) {
  const [beta, setBeta] = React.useState<{
    asi: number | null;
    spsl: number | null;
  } | null>(() => betaCache.get(row.symbol) ?? null);
  const [betaLoading, setBetaLoading] = React.useState(false);

  React.useEffect(() => {
    const cached = betaCache.get(row.symbol);
    if (cached) {
      setBeta(cached);
      return;
    }
    let active = true;
    const ctrl = new AbortController();
    setBeta(null);
    setBetaLoading(true);
    fetch(`/api/analytics/company?symbol=${encodeURIComponent(row.symbol)}`, {
      cache: "no-store",
      signal: ctrl.signal,
    })
      .then((res) => res.json())
      .then((json: { beta?: { asi: number | null; spsl: number | null } }) => {
        const b = {
          asi: json?.beta?.asi ?? null,
          spsl: json?.beta?.spsl ?? null,
        };
        betaCache.set(row.symbol, b);
        if (active) setBeta(b);
      })
      .catch(() => {
        if (active) setBeta({ asi: null, spsl: null });
      })
      .finally(() => {
        if (active) setBetaLoading(false);
      });
    return () => {
      active = false;
      ctrl.abort();
    };
  }, [row.symbol]);

  const betaValue = (v: number | null | undefined) =>
    betaLoading && beta == null ? (
      <Loader2 className="size-3 animate-spin text-muted-foreground" />
    ) : (
      fmtNum(v)
    );

  return (
    <div
      className="pointer-events-none fixed z-50 w-[340px] animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left, top }}
    >
      <div className="overflow-hidden rounded-xl border bg-popover/95 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-popover/80">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
          <span className="text-xs font-semibold text-foreground">
            Financial Highlights
          </span>
          <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
            {row.ticker}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 p-2.5">
          <HoverStat label="Turnover" value={`LKR ${fmtNum(row.turnover)}`} />
          <HoverStat label="Share Volume" value={fmtNum(row.shareVolume)} />
          <HoverStat label="Trade Volume" value={fmtNum(row.tradeVolume)} />
          <HoverStat
            label="Day's Price Range"
            value={`${fmtNum(row.high)} - ${fmtNum(row.low)}`}
          />
          <HoverStat
            label="Market Capitalization"
            value={`LKR ${fmtCompact(row.marketCap)}`}
          />
          <HoverStat
            label="Total Market Cap (%)"
            value={
              row.marketCapPct == null
                ? DASH
                : `${row.marketCapPct.toFixed(2)}%`
            }
          />
          <HoverStat
            label="Beta Values Against Aspi"
            value={betaValue(beta?.asi)}
          />
          <HoverStat
            label="Beta Values Against S&P Sl20"
            value={betaValue(beta?.spsl)}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watchlist manager dialog
// ---------------------------------------------------------------------------

function WatchlistManagerDialog({
  open,
  onOpenChange,
  universe,
  watchlists,
  onChange,
  onDeletedActive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  universe: StockRow[];
  watchlists: Watchlist[];
  onChange: (next: Watchlist[] | ((prev: Watchlist[]) => Watchlist[])) => void;
  onDeletedActive: (id: string) => void;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState("");

  const resetToNew = React.useCallback(() => {
    setEditingId(null);
    setName("");
    setSelected([]);
    setSearch("");
  }, []);

  React.useEffect(() => {
    if (open) resetToNew();
  }, [open, resetToNew]);

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const sortedUniverse = React.useMemo(
    () => [...universe].sort((a, b) => a.ticker.localeCompare(b.ticker)),
    [universe],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedUniverse;
    return sortedUniverse.filter(
      (r) =>
        r.ticker.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.symbol.toLowerCase().includes(q),
    );
  }, [sortedUniverse, search]);

  const symbolMeta = React.useMemo(() => {
    const m = new Map<string, StockRow>();
    for (const r of universe) m.set(r.symbol, r);
    return m;
  }, [universe]);

  const toggleSymbol = (symbol: string) => {
    setSelected((prev) =>
      prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol],
    );
  };

  const startEdit = (w: Watchlist) => {
    setEditingId(w.id);
    setName(w.name);
    setSelected(w.symbols);
    setSearch("");
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed || selected.length === 0) return;
    if (editingId) {
      onChange((prev) =>
        prev.map((w) =>
          w.id === editingId
            ? { ...w, name: trimmed, symbols: selected }
            : w,
        ),
      );
    } else {
      onChange((prev) => [
        ...prev,
        { id: makeWatchlistId(), name: trimmed, symbols: selected },
      ]);
    }
    resetToNew();
  };

  const handleDelete = (id: string) => {
    onChange((prev) => prev.filter((w) => w.id !== id));
    onDeletedActive(id);
    if (editingId === id) resetToNew();
  };

  const canSave = name.trim().length > 0 && selected.length > 0;

  const editingBaseline = React.useMemo(
    () =>
      editingId ? (watchlists.find((w) => w.id === editingId) ?? null) : null,
    [editingId, watchlists],
  );

  const isDirty = React.useMemo(() => {
    const trimmed = name.trim();
    if (!editingBaseline) {
      return trimmed.length > 0 || selected.length > 0;
    }
    if (trimmed !== editingBaseline.name) return true;
    if (selected.length !== editingBaseline.symbols.length) return true;
    const baseSet = new Set(editingBaseline.symbols);
    return selected.some((s) => !baseSet.has(s));
  }, [name, selected, editingBaseline]);

  const confirmEnabled = isDirty && canSave;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="size-4" /> My company lists
          </DialogTitle>
          <DialogDescription>
            Build custom groups of companies you follow. Selecting a list filters
            the table to just those companies.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Saved lists
            </span>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!confirmEnabled}
              className="bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-emerald-500/40 disabled:text-white/70"
            >
              <Check className="size-3.5" />
              {editingId ? "Confirm changes" : "Confirm"}
            </Button>
          </div>
          {watchlists.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {watchlists.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-2.5 text-xs",
                    editingId === w.id
                      ? "border-primary/40 bg-primary/10"
                      : "bg-muted/30",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => startEdit(w)}
                    className="font-medium text-foreground/90 hover:text-foreground"
                    title="Edit this list"
                  >
                    {w.name}
                    <span className="ml-1 text-muted-foreground">
                      ({w.symbols.length})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(w.id)}
                    className="flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400"
                    aria-label={`Delete ${w.name}`}
                    title="Delete list"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {editingId ? "Edit list" : "New list"}
            </span>
            {editingId ? (
              <Button variant="ghost" size="sm" onClick={resetToNew}>
                <Plus className="size-3.5" /> New
              </Button>
            ) : null}
          </div>

          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List name (e.g. My Banks, Blue chips)"
            aria-label="Watchlist name"
          />

          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((sym) => {
                const meta = symbolMeta.get(sym);
                return (
                  <span
                    key={sym}
                    className="flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2 text-[11px] text-primary"
                  >
                    {meta?.ticker ?? sym}
                    <button
                      type="button"
                      onClick={() => toggleSymbol(sym)}
                      className="flex size-3.5 items-center justify-center rounded-full hover:bg-primary/20"
                      aria-label={`Remove ${meta?.ticker ?? sym}`}
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No companies selected yet — pick from the list below.
            </p>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies to add..."
              className="pl-8"
              aria-label="Search companies"
            />
          </div>

          <div className="max-h-60 overflow-y-auto rounded-md border">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No companies match “{search}”
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {filtered.map((r) => {
                  const checked = selectedSet.has(r.symbol);
                  return (
                    <li key={r.symbol}>
                      <button
                        type="button"
                        onClick={() => toggleSymbol(r.symbol)}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted/50"
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded border",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40",
                          )}
                        >
                          {checked ? <Check className="size-3" /> : null}
                        </span>
                        <span className="font-medium text-foreground">
                          {r.ticker}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {r.name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Company detail dialog
// ---------------------------------------------------------------------------

type CompanyDetail = {
  symbol: string;
  name: string;
  logoUrl: string | null;
  isin: string | null;
  issueDate: string | null;
  lastTradedPrice: number | null;
  previousClose: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  marketCap: number | null;
  marketCapPct: number | null;
  parValue: number | null;
  sharesIssued: number | null;
  beta: { asi: number | null; spsl: number | null; period: string | null };
  hiLo: {
    weekHigh: number | null;
    weekLow: number | null;
    monthHigh: number | null;
    monthLow: number | null;
    ytdHigh: number | null;
    ytdLow: number | null;
    week52High: number | null;
    week52Low: number | null;
    allHigh: number | null;
    allLow: number | null;
  };
  volume: {
    today: number | null;
    month: number | null;
    ytd: number | null;
    p12: number | null;
  };
  turnover: {
    today: number | null;
    month: number | null;
    ytd: number | null;
  };
  error?: string;
};

function RangeBar({
  low,
  high,
  current,
  label,
}: {
  low: number | null;
  high: number | null;
  current: number | null;
  label: string;
}) {
  if (low == null || high == null || current == null || high <= low) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <div className="h-1.5 rounded-full bg-muted" />
      </div>
    );
  }
  const pos = Math.min(100, Math.max(0, ((current - low) / (high - low)) * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">
          {fmtNum(low)} – {fmtNum(high)}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-rose-500/40 via-amber-500/40 to-emerald-500/40">
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-background"
          style={{ left: `${pos}%` }}
        />
      </div>
    </div>
  );
}

function DetailStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border bg-muted/30 px-2.5 py-1.5">
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

function CompanyDetailDialog({
  symbol,
  fallback,
  onClose,
}: {
  symbol: string | null;
  fallback: StockRow | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = React.useState<CompanyDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!symbol) return;
    let active = true;
    setLoading(true);
    setDetail(null);
    setErr(null);
    fetch(`/api/analytics/company?symbol=${encodeURIComponent(symbol)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = (await res.json()) as CompanyDetail;
        if (!res.ok || json.error) {
          throw new Error(json.error ?? `Request failed (${res.status})`);
        }
        if (active) setDetail(json);
      })
      .catch((e) => {
        if (active) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [symbol]);

  const open = symbol != null;
  const price = detail?.lastTradedPrice ?? fallback?.price ?? null;
  const changePct = detail?.changePct ?? fallback?.changePct ?? null;
  const name = detail?.name ?? fallback?.name ?? "";
  const ticker = fallback?.ticker ?? symbol?.split(".")[0] ?? "";
  const logo = detail?.logoUrl ?? fallback?.logoUrl ?? null;
  const hue = hashHue(ticker);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <div className="flex items-center gap-3 pr-8">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={ticker}
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-full bg-white object-contain ring-1 ring-black/5"
            />
          ) : (
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{
                background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))`,
              }}
            >
              {ticker.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="flex min-w-0 flex-col">
            <DialogTitle className="truncate text-base">{ticker}</DialogTitle>
            <span className="truncate text-xs text-muted-foreground">
              {name}
            </span>
          </div>
          <div className="ml-auto flex flex-col items-end">
            <span className="text-xl font-semibold tabular-nums">
              {fmtNum(price)}
            </span>
            <ChangeBadge value={changePct} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading company data…
          </div>
        ) : err ? (
          <div className="py-10 text-center text-sm text-rose-600 dark:text-rose-400">
            {err}
          </div>
        ) : detail ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2">
              <DetailStat label="Open" value={fmtNum(detail.open)} />
              <DetailStat label="High" value={fmtNum(detail.high)} />
              <DetailStat label="Low" value={fmtNum(detail.low)} />
              <DetailStat
                label="Prev close"
                value={fmtNum(detail.previousClose)}
              />
              <DetailStat
                label="Market cap"
                value={`Rs ${fmtCompact(detail.marketCap)}`}
              />
              <DetailStat
                label="Mkt cap %"
                value={
                  detail.marketCapPct == null
                    ? DASH
                    : `${detail.marketCapPct.toFixed(2)}%`
                }
              />
              <DetailStat
                label="Beta (ASI)"
                value={fmtNum(detail.beta.asi)}
              />
              <DetailStat
                label="Beta (SL20)"
                value={fmtNum(detail.beta.spsl)}
              />
              <DetailStat
                label="Shares"
                value={fmtCompact(detail.sharesIssued)}
              />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
              <RangeBar
                label="52-week range"
                low={detail.hiLo.week52Low}
                high={detail.hiLo.week52High}
                current={price}
              />
              <RangeBar
                label="Year-to-date range"
                low={detail.hiLo.ytdLow}
                high={detail.hiLo.ytdHigh}
                current={price}
              />
              <RangeBar
                label="All-time range"
                low={detail.hiLo.allLow}
                high={detail.hiLo.allHigh}
                current={price}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <DetailStat
                label="Vol today"
                value={fmtCompact(detail.volume.today)}
              />
              <DetailStat
                label="Vol MTD"
                value={fmtCompact(detail.volume.month)}
              />
              <DetailStat
                label="Vol YTD"
                value={fmtCompact(detail.volume.ytd)}
              />
              <DetailStat
                label="T/O today"
                value={`Rs ${fmtCompact(detail.turnover.today)}`}
              />
              <DetailStat
                label="T/O MTD"
                value={`Rs ${fmtCompact(detail.turnover.month)}`}
              />
              <DetailStat
                label="T/O YTD"
                value={`Rs ${fmtCompact(detail.turnover.ytd)}`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {detail.isin ? <span>ISIN: {detail.isin}</span> : null}
              {detail.issueDate ? (
                <span>Listed: {detail.issueDate}</span>
              ) : null}
              {detail.parValue != null ? (
                <span>Par: Rs {fmtNum(detail.parValue)}</span>
              ) : null}
              {detail.beta.period ? (
                <span>Beta period: {detail.beta.period}</span>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
