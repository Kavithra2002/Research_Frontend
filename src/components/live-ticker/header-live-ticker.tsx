"use client";

import * as React from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CircleDot,
  Flame,
  Gauge,
  LineChart,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Live data flows in from the CSE proxy at /api/cse/<endpoint> and is rebuilt
// into many small bubbles that scroll across the header.
// ---------------------------------------------------------------------------

type Tone = "up" | "down" | "neutral";

type Category =
  | "indices"
  | "gainers"
  | "losers"
  | "active"
  | "market";

type Bubble = {
  key: string;
  category: Category;
  symbol: string;
  logo?: string | null;
  label: string;
  value: string;
  sub?: string;
  tone: Tone;
  spark?: number[];
};

const CATEGORY_META: {
  id: Category;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "indices", label: "Indices (ASPI / S&P)", icon: LineChart },
  { id: "gainers", label: "Top Gainers", icon: TrendingUp },
  { id: "losers", label: "Top Losers", icon: TrendingDown },
  { id: "active", label: "Most Active", icon: Flame },
  { id: "market", label: "Market Stats", icon: Gauge },
];

const STORAGE_KEY = "header-live-ticker-category";
const REFRESH_MS = 30_000;
const CDN_BASE = "https://cdn.cse.lk";

// ---------------------------------------------------------------------------
// Fetch + format helpers
// ---------------------------------------------------------------------------

async function fetchEndpoint<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/cse/${endpoint}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function fmtNum(n: number | undefined | null, digits = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtCompact(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

function toneFrom(n: number | undefined | null): Tone {
  if (n === undefined || n === null || Number.isNaN(n)) return "neutral";
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "neutral";
}

function cleanSymbol(symbol: string | undefined | null): string {
  if (!symbol) return "—";
  return symbol.split(".")[0];
}

function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.replace(/^\/+/, "");
  if (trimmed.startsWith("cmt/")) return `${CDN_BASE}/${trimmed}`;
  return `${CDN_BASE}/cmt/${trimmed}`;
}

// Build a short, deterministic sparkline anchored on real start/end values so
// each bubble shows a tiny trend line.
function spark(start: number, end: number, seed: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const pts: number[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const base = start + (end - start) * t;
    // Small deterministic wobble so the line reads like a chart, not a ruler.
    const wobble =
      Math.sin((seed + i) * 1.7) * Math.abs(end - start || end || 1) * 0.08;
    pts.push(base + wobble);
  }
  pts[0] = start;
  pts[steps] = end;
  return pts;
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

type IndexData = { value?: number; change?: number; percentage?: number };
type MoverRow = {
  symbol?: string;
  price?: number;
  change?: number;
  changePercentage?: number;
  logoUrl?: string | null;
};
type ActiveTradeRow = {
  symbol?: string;
  turnover?: number;
  shareVolume?: number;
  logoUrl?: string | null;
};
type MarketSummary = {
  tradeVolume?: number;
  shareVolume?: number;
  trades?: number;
};
type MarketStatus = { status?: string };

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const toneText: Record<Tone, string> = {
  up: "text-emerald-600 dark:text-emerald-400",
  down: "text-rose-600 dark:text-rose-400",
  neutral: "text-foreground",
};

const toneStroke: Record<Tone, string> = {
  up: "#10b981",
  down: "#f43f5e",
  neutral: "#64748b",
};

function Sparkline({ points, tone }: { points: number[]; tone: Tone }) {
  if (!points || points.length < 2) return null;
  const w = 40;
  const h = 16;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - ((p - min) / range) * (h - 2) - 1;
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const stroke = toneStroke[tone];
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0"
      aria-hidden
    >
      <path d={area} fill={stroke} fillOpacity={0.14} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CompanyIcon({
  symbol,
  logo,
}: {
  symbol: string;
  logo?: string | null;
}) {
  const [broken, setBroken] = React.useState(false);
  const initials = cleanSymbol(symbol).slice(0, 2).toUpperCase();
  const hue = hashHue(symbol);
  if (logo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={symbol}
        width={20}
        height={20}
        onError={() => setBroken(true)}
        className="size-5 shrink-0 rounded-full bg-white object-contain ring-1 ring-black/5"
      />
    );
  }
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white ring-1 ring-black/5"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))`,
      }}
    >
      {initials}
    </span>
  );
}

function BubblePill({ bubble }: { bubble: Bubble }) {
  const ToneIcon =
    bubble.tone === "up"
      ? ArrowUpRight
      : bubble.tone === "down"
        ? ArrowDownRight
        : Activity;
  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 rounded-full border bg-card/90 pl-1.5 pr-3 shadow-sm backdrop-blur",
        bubble.tone === "up" &&
          "border-emerald-500/30 bg-emerald-500/5",
        bubble.tone === "down" && "border-rose-500/30 bg-rose-500/5",
      )}
    >
      <CompanyIcon symbol={bubble.symbol} logo={bubble.logo} />
      <div className="flex flex-col leading-none">
        <span className="text-[10px] font-medium text-muted-foreground">
          {bubble.label}
        </span>
        <span className="text-xs font-semibold tabular-nums">
          {bubble.value}
        </span>
      </div>
      {bubble.spark && bubble.spark.length > 1 ? (
        <Sparkline points={bubble.spark} tone={bubble.tone} />
      ) : null}
      {bubble.sub ? (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums",
            toneText[bubble.tone],
          )}
        >
          <ToneIcon className="size-3" />
          {bubble.sub}
        </span>
      ) : null}
    </div>
  );
}

function SkeletonPill() {
  return (
    <div className="flex h-9 w-36 shrink-0 items-center gap-2 rounded-full border bg-muted/40 px-2">
      <span className="size-5 animate-pulse rounded-full bg-muted-foreground/20" />
      <span className="h-3 w-20 animate-pulse rounded bg-muted-foreground/20" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const DEFAULT_CATEGORY: Category = "indices";

export function HeaderLiveTicker({ className }: { className?: string }) {
  const [bubbles, setBubbles] = React.useState<Bubble[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Category>(DEFAULT_CATEGORY);

  // Restore the single selected category.
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Category | null;
      if (saved && CATEGORY_META.some((c) => c.id === saved)) {
        setSelected(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  // Fetch all live slices and rebuild bubbles, then poll.
  React.useEffect(() => {
    let active = true;

    const run = async () => {
      const [status, summary, aspi, snp, gainers, losers, mostActive] =
        await Promise.all([
          fetchEndpoint<MarketStatus>("marketStatus"),
          fetchEndpoint<MarketSummary>("marketSummery"),
          fetchEndpoint<IndexData>("aspiData"),
          fetchEndpoint<IndexData>("snpData"),
          fetchEndpoint<MoverRow[]>("topGainers"),
          fetchEndpoint<MoverRow[]>("topLooses"),
          fetchEndpoint<ActiveTradeRow[]>("mostActiveTrades"),
        ]);
      if (!active) return;

      const next: Bubble[] = [];

      // Indices
      if (aspi) {
        const prev = (aspi.value ?? 0) - (aspi.change ?? 0);
        next.push({
          key: "aspi",
          category: "indices",
          symbol: "ASPI",
          label: "ASPI Index",
          value: fmtNum(aspi.value),
          sub: fmtPct(aspi.percentage),
          tone: toneFrom(aspi.percentage ?? aspi.change),
          spark: spark(prev, aspi.value ?? prev, 3),
        });
      }
      if (snp) {
        const prev = (snp.value ?? 0) - (snp.change ?? 0);
        next.push({
          key: "snp",
          category: "indices",
          symbol: "SP-SL20",
          label: "S&P SL20",
          value: fmtNum(snp.value),
          sub: fmtPct(snp.percentage),
          tone: toneFrom(snp.percentage ?? snp.change),
          spark: spark(prev, snp.value ?? prev, 7),
        });
      }

      // Market stats
      if (status?.status) {
        next.push({
          key: "status",
          category: "market",
          symbol: "MKT",
          label: "Market",
          value: status.status,
          tone: /open/i.test(status.status) ? "up" : "neutral",
        });
      }
      if (summary) {
        next.push({
          key: "turnover",
          category: "market",
          symbol: "TO",
          label: "Turnover",
          value: `Rs ${fmtCompact(summary.tradeVolume)}`,
          tone: "neutral",
        });
        next.push({
          key: "volume",
          category: "market",
          symbol: "VOL",
          label: "Share Volume",
          value: fmtCompact(summary.shareVolume),
          tone: "neutral",
        });
        next.push({
          key: "trades",
          category: "market",
          symbol: "TRD",
          label: "Trades",
          value: fmtCompact(summary.trades),
          tone: "neutral",
        });
      }

      // Gainers
      (gainers ?? []).slice(0, 6).forEach((row, i) => {
        const prev = (row.price ?? 0) / (1 + (row.changePercentage ?? 0) / 100);
        next.push({
          key: `gain-${row.symbol ?? i}`,
          category: "gainers",
          symbol: row.symbol ?? `G${i}`,
          logo: logoUrl(row.logoUrl),
          label: cleanSymbol(row.symbol),
          value: fmtNum(row.price),
          sub: fmtPct(row.changePercentage),
          tone: "up",
          spark: spark(prev, row.price ?? prev, i + 1),
        });
      });

      // Losers
      (losers ?? []).slice(0, 6).forEach((row, i) => {
        const prev = (row.price ?? 0) / (1 + (row.changePercentage ?? 0) / 100);
        next.push({
          key: `lose-${row.symbol ?? i}`,
          category: "losers",
          symbol: row.symbol ?? `L${i}`,
          logo: logoUrl(row.logoUrl),
          label: cleanSymbol(row.symbol),
          value: fmtNum(row.price),
          sub: fmtPct(row.changePercentage),
          tone: "down",
          spark: spark(prev, row.price ?? prev, i + 2),
        });
      });

      // Most active
      (mostActive ?? []).slice(0, 6).forEach((row, i) => {
        next.push({
          key: `act-${row.symbol ?? i}`,
          category: "active",
          symbol: row.symbol ?? `A${i}`,
          logo: logoUrl(row.logoUrl),
          label: cleanSymbol(row.symbol),
          value: `Rs ${fmtCompact(row.turnover)}`,
          tone: "neutral",
        });
      });

      setBubbles(next);
      setLoading(false);
    };

    void run();
    const timer = setInterval(run, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const select = (id: Category) => {
    setSelected(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  };

  const visible = React.useMemo(
    () => bubbles.filter((b) => b.category === selected),
    [bubbles, selected],
  );

  // Duplicate the list so the marquee can loop seamlessly.
  const loop = React.useMemo(() => [...visible, ...visible], [visible]);

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2", className)}>
      {/* Tiny filter bubble next to the breadcrumb */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="group relative flex size-7 shrink-0 items-center justify-center rounded-full border bg-card shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          aria-label="Choose live data"
        >
          <span className="absolute -right-0.5 -top-0.5 flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/70" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <SlidersHorizontal className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Live market bubbles</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {CATEGORY_META.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selected === cat.id;
              return (
                <DropdownMenuCheckboxItem
                  key={cat.id}
                  checked={isSelected}
                  onCheckedChange={() => select(cat.id)}
                  className={cn(
                    "[&_[data-slot=dropdown-menu-checkbox-item-indicator]_svg]:text-emerald-600 [&_[data-slot=dropdown-menu-checkbox-item-indicator]_svg]:stroke-[3] dark:[&_[data-slot=dropdown-menu-checkbox-item-indicator]_svg]:text-emerald-400",
                    isSelected &&
                      "bg-emerald-500/10 text-emerald-700 focus:bg-emerald-500/15 dark:text-emerald-400",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4 text-muted-foreground",
                      isSelected && "text-emerald-600 dark:text-emerald-400",
                    )}
                  />
                  <span>{cat.label}</span>
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Flowing marquee of live bubbles */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-background to-transparent" />
        {loading ? (
          <div className="flex items-center gap-2 py-1">
            <SkeletonPill />
            <SkeletonPill />
            <SkeletonPill />
            <CircleDot className="size-3 animate-pulse text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex h-9 items-center text-xs text-muted-foreground">
            No live bubbles selected
          </div>
        ) : (
          <div className="flex w-max animate-marquee-x-reverse items-center gap-2 py-1 pause-on-hover">
            {loop.map((bubble, i) => (
              <BubblePill key={`${bubble.key}-${i}`} bubble={bubble} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
