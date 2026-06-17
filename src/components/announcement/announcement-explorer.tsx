"use client";

import * as React from "react";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  FileText,
  Flame,
  Gauge,
  Megaphone,
  Newspaper,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// API types — match the actual responses returned by the CSE endpoints.
// ---------------------------------------------------------------------------

type MarketStatus = { status?: string };

type MarketSummary = {
  id?: number;
  tradeVolume?: number;
  shareVolume?: number;
  tradeDate?: number;
  trades?: number;
};

type IndexData = {
  id?: number;
  value?: number;
  lowValue?: number;
  highValue?: number;
  change?: number;
  percentage?: number;
  sectorId?: number;
  timestamp?: number;
};

type MoverRow = {
  id?: number;
  securityId?: number;
  symbol?: string;
  price?: number;
  change?: number;
  changePercentage?: number;
  tradeDate?: number;
};

type ActiveTradeRow = {
  id?: number;
  securityId?: number;
  symbol?: string;
  tradeVolume?: number;
  shareVolume?: number;
  turnover?: number;
  percentageShareVolume?: number;
};

type SectorRow = {
  id?: number;
  sectorId?: number;
  symbol?: string;
  indexCode?: string;
  indexCodeSp?: string;
  indexName?: string;
  name?: string;
  indexValue?: number;
  change?: number;
  percentage?: number;
  sectorTradeToday?: number;
  sectorVolumeToday?: number;
  sectorTurnoverToday?: number;
  sectorPreviousClose?: number;
  transactionTime?: number;
};

type TodayPriceRow = {
  id?: number;
  symbol?: string;
  open?: number;
  high?: number;
  low?: number;
  lastTradedPrice?: number;
  change?: number;
  changePercentage?: number;
  crossingVolume?: number;
  tradesTime?: number;
  quantity?: number;
};

type DailyMarketRecord = {
  id?: number;
  tradeDate?: number;
  marketTurnover?: number;
  marketTrades?: number;
  marketCap?: number;
  asi?: number;
  spp?: number;
  per?: number;
  pbv?: number;
  dy?: number;
};

type AnnouncementRow = {
  id?: number;
  announcementId?: number;
  createdDate?: string | number;
  dateOfAnnouncement?: string;
  title?: string | null;
  announcementCategory?: string;
  category?: string;
  company?: string;
  companyName?: string | null;
  symbol?: string | null;
  type?: string | null;
  remarks?: string | null;
  recordDate?: string | null;
  agmDate?: string | null;
  paymentDate?: string | null;
  tradingCommencement?: string | null;
  tradingSuspended?: string | null;
  logoUrl?: string | null;
};

type DocumentRow = {
  id?: number;
  path?: string;
  manualDate?: number;
  uploadedDate?: string;
  fileText?: string;
  name?: string;
  symbol?: string;
  logoUrl?: string | null;
  authorizedDate?: string;
};

// Snapshot of every data slice we display on the page.
type Snapshot = {
  marketStatus: MarketStatus | null;
  marketSummary: MarketSummary | null;
  aspi: IndexData | null;
  snp: IndexData | null;
  topGainers: MoverRow[];
  topLosers: MoverRow[];
  mostActive: ActiveTradeRow[];
  sectors: SectorRow[];
  todayPrices: TodayPriceRow[];
  dailyHistory: DailyMarketRecord[];
  approved: AnnouncementRow[];
  newListings: AnnouncementRow[];
  buyIn: AnnouncementRow[];
  nonCompliance: AnnouncementRow[];
  covid: AnnouncementRow[];
  financial: DocumentRow[];
  circular: DocumentRow[];
  directive: DocumentRow[];
};

const ANNOUNCEMENT_LIST_LIMIT = 15;

const EMPTY_SNAPSHOT: Snapshot = {
  marketStatus: null,
  marketSummary: null,
  aspi: null,
  snp: null,
  topGainers: [],
  topLosers: [],
  mostActive: [],
  sectors: [],
  todayPrices: [],
  dailyHistory: [],
  approved: [],
  newListings: [],
  buyIn: [],
  nonCompliance: [],
  covid: [],
  financial: [],
  circular: [],
  directive: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CDN_BASE = "https://cdn.cse.lk";

function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.replace(/^\/+/, "");
  if (trimmed.startsWith("cmt/")) return `${CDN_BASE}/${trimmed}`;
  return `${CDN_BASE}/cmt/${trimmed}`;
}

function fileUrl(path: string | null | undefined): string | null {
  return logoUrl(path);
}

function fmtNumber(n: number | undefined | null, fractionDigits = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function fmtInt(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
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

function fmtPct(n: number | undefined | null, withSign = true): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  const sign = withSign && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtDate(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "—";
  let date: Date;
  if (typeof value === "number") {
    date = new Date(value);
  } else {
    const parsed = Date.parse(value);
    date = Number.isNaN(parsed) ? new Date() : new Date(parsed);
    if (Number.isNaN(parsed)) return value;
  }
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateOnly(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "—";
  let date: Date;
  if (typeof value === "number") {
    date = new Date(value);
  } else {
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return value;
    date = new Date(parsed);
  }
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function cleanSymbol(symbol: string | null | undefined): string {
  if (!symbol) return "—";
  return symbol.replace(/\.[A-Z0-9]+$/, "");
}

function decodeMojibake(text: string | null | undefined): string {
  if (!text) return "";
  // Many CSE responses contain mojibake like "�??" for smart quotes. Replace
  // the most common occurrences so the rendered text is readable.
  return text
    .replace(/\uFFFD\?\?/g, "'")
    .replace(/\uFFFD\?[??]/g, "'")
    .replace(/\uFFFD/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "\"");
}

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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function toneClass(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v) || v === 0) return "text-muted-foreground";
  return v > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
}

function ChangeBadge({
  value,
  percentage,
  size = "default",
}: {
  value?: number | null;
  percentage?: number | null;
  size?: "default" | "sm";
}) {
  const pct = percentage ?? null;
  const positive = (pct ?? value ?? 0) > 0;
  const negative = (pct ?? value ?? 0) < 0;
  const neutral = !positive && !negative;
  const Icon = positive ? ArrowUpRight : negative ? ArrowDownRight : Activity;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium tabular-nums",
        size === "sm" ? "text-xs" : "text-sm",
        positive && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        negative && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
        neutral && "bg-muted text-muted-foreground",
      )}
    >
      <Icon className={cn(size === "sm" ? "size-3" : "size-3.5")} />
      <span>
        {value !== undefined && value !== null ? (
          <>
            {value > 0 ? "+" : ""}
            {value.toFixed(2)}
          </>
        ) : null}
        {pct !== undefined && pct !== null ? (
          <>
            {value !== undefined && value !== null ? " · " : ""}
            {fmtPct(pct)}
          </>
        ) : null}
      </span>
    </span>
  );
}

function MarketStatCell({
  label,
  value,
  sub,
  tone,
  change,
  percentage,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: number | null;
  change?: number | null;
  percentage?: number | null;
}) {
  const hasChange = change != null || percentage != null;
  const direction = percentage ?? change ?? 0;
  const positive = direction > 0;
  const negative = direction < 0;
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border bg-card px-3 py-2">
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="truncate text-lg font-semibold tabular-nums text-foreground">
        {value}
      </span>
      {hasChange ? (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
            toneClass(percentage ?? change),
          )}
        >
          {positive ? (
            <ArrowUpRight className="size-3" />
          ) : negative ? (
            <ArrowDownRight className="size-3" />
          ) : null}
          {change != null ? (
            <span>
              {change > 0 ? "+" : ""}
              {change.toFixed(2)}
            </span>
          ) : null}
          {percentage != null ? (
            <span>
              {change != null ? " " : ""}
              ({fmtPct(percentage)})
            </span>
          ) : null}
        </span>
      ) : sub ? (
        <span
          className={cn("text-xs font-medium tabular-nums", toneClass(tone))}
        >
          {sub}
        </span>
      ) : null}
    </div>
  );
}

function MarketOverviewSection({
  data,
  totals,
  status,
  isOpen,
  isClosed,
}: {
  data: Snapshot;
  totals: {
    advancers: number;
    decliners: number;
    tradingCompanies: number;
    totalSectorTurnover: number;
    totalSectorVolume: number;
  };
  status: string;
  isOpen: boolean;
  isClosed: boolean;
}) {
  const breadthTotal = totals.advancers + totals.decliners || 1;
  return (
    <Card size="sm" className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-primary" />
          <span className="text-sm font-medium">Market overview</span>
          <Badge
            variant={isOpen ? "default" : "secondary"}
            className={cn(
              "h-5 font-medium",
              isOpen &&
                "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
              isClosed &&
                "bg-rose-500/15 text-rose-700 dark:text-rose-300",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                isOpen
                  ? "animate-pulse bg-emerald-500"
                  : isClosed
                    ? "bg-rose-500"
                    : "bg-amber-500",
              )}
            />
            {status}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {data.marketSummary?.tradeDate
            ? `Session ${fmtDate(data.marketSummary.tradeDate)}`
            : "Live CSE data"}
        </span>
      </div>

      <CardContent className="py-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <MarketStatCell
            label="ASPI"
            value={fmtNumber(data.aspi?.value)}
            change={data.aspi?.change}
            percentage={data.aspi?.percentage}
          />
          <MarketStatCell
            label="S&P SL20"
            value={fmtNumber(data.snp?.value)}
            change={data.snp?.change}
            percentage={data.snp?.percentage}
          />
          <MarketStatCell
            label="Turnover"
            value={`LKR ${fmtCompact(data.marketSummary?.tradeVolume)}`}
          />
          <MarketStatCell
            label="Volume"
            value={fmtCompact(data.marketSummary?.shareVolume)}
            sub={`${fmtInt(data.marketSummary?.trades)} trades`}
          />
          <MarketStatCell
            label="Companies"
            value={fmtInt(totals.tradingCompanies)}
            sub={`${fmtInt(data.sectors.length)} sectors`}
          />
          <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-3 py-2">
            <div className="flex items-center justify-between text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              <span>Breadth</span>
              <span className="normal-case tracking-normal">
                {fmtInt(totals.advancers)}↑ · {fmtInt(totals.decliners)}↓
              </span>
            </div>
            <div className="mt-0.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="bg-emerald-500"
                style={{
                  width: `${(totals.advancers / breadthTotal) * 100}%`,
                }}
              />
              <div
                className="bg-rose-500"
                style={{
                  width: `${(totals.decliners / breadthTotal) * 100}%`,
                }}
              />
            </div>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              Top movers list
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CompanyLogo({
  path,
  alt,
  size = 32,
}: {
  path: string | null | undefined;
  alt: string;
  size?: number;
}) {
  const [errored, setErrored] = React.useState(false);
  const src = logoUrl(path);
  if (!src || errored) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-md border bg-muted text-[10px] font-semibold text-muted-foreground"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {alt
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w.charAt(0).toUpperCase())
          .join("")}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className="shrink-0 rounded-md border bg-white object-contain p-0.5"
      style={{ width: size, height: size }}
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}

function MoverList({
  rows,
  variant,
}: {
  rows: MoverRow[];
  variant: "gainer" | "loser";
}) {
  const top = rows.slice(0, 10);
  if (top.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
        No data available
      </div>
    );
  }
  return (
    <ul className="divide-y">
      {top.map((row, idx) => (
        <li
          key={`${variant}-${row.symbol ?? "x"}-${row.id ?? "x"}-${idx}`}
          className="flex items-center gap-3 py-2.5"
        >
          <div
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums",
              variant === "gainer"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
            )}
          >
            {idx + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {cleanSymbol(row.symbol)}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {row.symbol}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold tabular-nums">
              LKR {fmtNumber(row.price)}
            </div>
            <ChangeBadge
              value={row.change}
              percentage={row.changePercentage}
              size="sm"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ActiveList({ rows }: { rows: ActiveTradeRow[] }) {
  const top = rows.slice(0, 10);
  if (top.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
        No data available
      </div>
    );
  }
  const maxTurnover = Math.max(
    ...top.map((r) => r.turnover ?? 0),
    1,
  );
  return (
    <ul className="divide-y">
      {top.map((row, idx) => {
        const turnoverPct = ((row.turnover ?? 0) / maxTurnover) * 100;
        return (
          <li
            key={`active-${row.symbol ?? "x"}-${row.id ?? "x"}-${idx}`}
            className="flex items-center gap-3 py-2.5"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary tabular-nums">
              {idx + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {cleanSymbol(row.symbol)}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {fmtInt(row.shareVolume)} shares
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(2, turnoverPct)}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-foreground tabular-nums">
                  LKR {fmtCompact(row.turnover)}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function AnnouncementCard({ row }: { row: AnnouncementRow }) {
  const category = decodeMojibake(row.announcementCategory ?? "");
  const company = decodeMojibake(
    row.company ?? row.companyName ?? "Unknown Company",
  );
  const remarks = decodeMojibake(row.remarks ?? row.title ?? "");
  return (
    <div className="flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40">
      <CompanyLogo path={row.logoUrl} alt={company} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-normal">
            {category || "Announcement"}
          </Badge>
          {row.symbol ? (
            <Badge variant="outline" className="font-mono">
              {row.symbol}
            </Badge>
          ) : null}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {fmtDate(row.createdDate ?? row.dateOfAnnouncement)}
          </span>
        </div>
        <div className="mt-1 text-sm font-medium leading-snug">{company}</div>
        {remarks ? (
          <div className="mt-1 line-clamp-3 text-xs text-muted-foreground">
            {remarks}
          </div>
        ) : null}
        {(row.recordDate ||
          row.agmDate ||
          row.paymentDate ||
          row.tradingCommencement ||
          row.tradingSuspended) ? (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {row.recordDate ? (
              <span>
                <span className="font-medium text-foreground">Record:</span>{" "}
                {row.recordDate}
              </span>
            ) : null}
            {row.agmDate ? (
              <span>
                <span className="font-medium text-foreground">AGM:</span>{" "}
                {row.agmDate}
              </span>
            ) : null}
            {row.paymentDate ? (
              <span>
                <span className="font-medium text-foreground">Payment:</span>{" "}
                {row.paymentDate}
              </span>
            ) : null}
            {row.tradingCommencement ? (
              <span>
                <span className="font-medium text-foreground">
                  Trading start:
                </span>{" "}
                {row.tradingCommencement}
              </span>
            ) : null}
            {row.tradingSuspended ? (
              <span>
                <span className="font-medium text-foreground">
                  Trading suspended:
                </span>{" "}
                {row.tradingSuspended}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DocumentCard({ row }: { row: DocumentRow }) {
  const url = fileUrl(row.path);
  const title = decodeMojibake(row.fileText ?? "Document");
  const name = decodeMojibake(row.name ?? "");
  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40"
    >
      <CompanyLogo
        path={row.logoUrl ?? null}
        alt={name || title}
        size={40}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {row.symbol ? (
            <Badge variant="outline" className="font-mono">
              {row.symbol}
            </Badge>
          ) : null}
          <Badge variant="secondary" className="font-normal">
            PDF
          </Badge>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {row.uploadedDate ??
              (row.manualDate ? fmtDate(row.manualDate) : "—")}
          </span>
        </div>
        {name ? (
          <div className="mt-1 text-sm font-medium leading-snug">{name}</div>
        ) : null}
        <div
          className={cn(
            "mt-1 line-clamp-2 text-xs",
            name ? "text-muted-foreground" : "font-medium text-foreground",
          )}
        >
          {title}
        </div>
      </div>
      <ExternalLink className="size-4 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}

function SectorTable({ rows }: { rows: SectorRow[] }) {
  const sorted = [...rows].sort(
    (a, b) => (b.percentage ?? 0) - (a.percentage ?? 0),
  );
  if (sorted.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
        No sector data available
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Sector</TableHead>
            <TableHead className="text-right">Index value</TableHead>
            <TableHead className="text-right">Change</TableHead>
            <TableHead className="text-right">% Change</TableHead>
            <TableHead className="text-right">Volume</TableHead>
            <TableHead className="text-right">Turnover (LKR)</TableHead>
            <TableHead className="text-right">Trades</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row, idx) => {
            const positive = (row.percentage ?? 0) > 0;
            const negative = (row.percentage ?? 0) < 0;
            return (
              <TableRow
                key={`sector-${row.sectorId ?? "x"}-${row.symbol ?? "x"}-${idx}`}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      {row.symbol}
                    </Badge>
                    <span className="text-sm">{row.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNumber(row.indexValue)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    positive && "text-emerald-600 dark:text-emerald-400",
                    negative && "text-rose-600 dark:text-rose-400",
                  )}
                >
                  {row.change !== undefined
                    ? `${row.change > 0 ? "+" : ""}${fmtNumber(row.change)}`
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <ChangeBadge percentage={row.percentage} size="sm" />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtInt(row.sectorVolumeToday)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtCompact(row.sectorTurnoverToday)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtInt(row.sectorTradeToday)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function TodayPricesTable({
  rows,
  query,
}: {
  rows: TodayPriceRow[];
  query: string;
}) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) => (r.symbol ?? "").toLowerCase().includes(q))
    : rows;
  const sorted = [...filtered].sort(
    (a, b) => (b.changePercentage ?? 0) - (a.changePercentage ?? 0),
  );
  if (sorted.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
        No trading data for today
      </div>
    );
  }
  return (
    <div className="max-h-[520px] overflow-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 bg-card">
          <TableRow className="hover:bg-transparent">
            <TableHead>Symbol</TableHead>
            <TableHead className="text-right">Open</TableHead>
            <TableHead className="text-right">High</TableHead>
            <TableHead className="text-right">Low</TableHead>
            <TableHead className="text-right">Last</TableHead>
            <TableHead className="text-right">Change</TableHead>
            <TableHead className="text-right">% Change</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row, idx) => (
            <TableRow key={`tp-${row.symbol ?? "x"}-${row.id ?? "x"}-${idx}`}>
              <TableCell>
                <Badge variant="outline" className="font-mono">
                  {row.symbol}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtNumber(row.open)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtNumber(row.high)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtNumber(row.low)}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {fmtNumber(row.lastTradedPrice)}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums",
                  (row.change ?? 0) > 0 &&
                    "text-emerald-600 dark:text-emerald-400",
                  (row.change ?? 0) < 0 && "text-rose-600 dark:text-rose-400",
                )}
              >
                {row.change !== undefined
                  ? `${row.change > 0 ? "+" : ""}${fmtNumber(row.change)}`
                  : "—"}
              </TableCell>
              <TableCell className="text-right">
                <ChangeBadge percentage={row.changePercentage} size="sm" />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtInt(row.quantity)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.tradesTime
                  ? new Date(row.tradesTime).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DailyHistoryTable({ rows }: { rows: DailyMarketRecord[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
        No historic data
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Trade date</TableHead>
            <TableHead className="text-right">ASPI</TableHead>
            <TableHead className="text-right">S&amp;P SL20</TableHead>
            <TableHead className="text-right">Turnover</TableHead>
            <TableHead className="text-right">Trades</TableHead>
            <TableHead className="text-right">Market cap</TableHead>
            <TableHead className="text-right">PER</TableHead>
            <TableHead className="text-right">PBV</TableHead>
            <TableHead className="text-right">Div yield</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, idx) => (
            <TableRow key={`dms-${r.id ?? "x"}-${r.tradeDate ?? "x"}-${idx}`}>
              <TableCell className="font-medium">
                {fmtDateOnly(r.tradeDate)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtNumber(r.asi)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtNumber(r.spp)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtCompact(r.marketTurnover)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtInt(r.marketTrades)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtCompact(r.marketCap)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtNumber(r.per)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtNumber(r.pbv)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtNumber(r.dy)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnnouncementExplorer() {
  const [data, setData] = React.useState<Snapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [activeAnnTab, setActiveAnnTab] = React.useState<string>("approved");
  const [activeMoverTab, setActiveMoverTab] = React.useState<string>("gainers");
  const [priceQuery, setPriceQuery] = React.useState("");

  const load = React.useCallback(async (mode: "initial" | "refresh") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const results = await Promise.allSettled([
        fetchEndpoint<MarketStatus>("marketStatus"),
        fetchEndpoint<MarketSummary>("marketSummery"),
        fetchEndpoint<IndexData>("aspiData"),
        fetchEndpoint<IndexData>("snpData"),
        fetchEndpoint<MoverRow[]>("topGainers"),
        fetchEndpoint<MoverRow[]>("topLooses"),
        fetchEndpoint<ActiveTradeRow[]>("mostActiveTrades"),
        fetchEndpoint<SectorRow[]>("allSectors"),
        fetchEndpoint<TodayPriceRow[]>("todaySharePrice"),
        fetchEndpoint<unknown>("dailyMarketSummery"),
        fetchEndpoint<{ approvedAnnouncements?: AnnouncementRow[] }>(
          "approvedAnnouncement",
        ),
        fetchEndpoint<{ newListingRelatedAnnouncements?: AnnouncementRow[] }>(
          "getNewListingsRelatedNoticesAnnouncements",
        ),
        fetchEndpoint<{ buyInBoardAnnouncements?: AnnouncementRow[] }>(
          "getBuyInBoardAnnouncements",
        ),
        fetchEndpoint<{ nonComplianceAnnouncements?: AnnouncementRow[] }>(
          "getNonComplianceAnnouncements",
        ),
        fetchEndpoint<{ covidAnnouncements?: AnnouncementRow[] }>(
          "getCOVIDAnnouncements",
        ),
        fetchEndpoint<{ reqFinancialAnnouncemnets?: DocumentRow[] }>(
          "getFinancialAnnouncement",
        ),
        fetchEndpoint<{ reqCircularAnnouncement?: DocumentRow[] }>(
          "circularAnnouncement",
        ),
        fetchEndpoint<{ reqDirectiveAnnouncement?: DocumentRow[] }>(
          "directiveAnnouncement",
        ),
      ]);

      const value = <T,>(idx: number, fallback: T): T => {
        const r = results[idx];
        if (r.status === "fulfilled" && r.value !== null && r.value !== undefined) {
          return r.value as T;
        }
        return fallback;
      };

      // The dailyMarketSummery response is nested as either
      // `[[record], [record], ...]` or `[{ value:[record], Count:1 }, ...]`
      // depending on serializer. Normalise here.
      const rawDaily = value<unknown>(9, []);
      const dailyHistory: DailyMarketRecord[] = Array.isArray(rawDaily)
        ? (rawDaily as unknown[])
            .map((entry) => {
              if (Array.isArray(entry) && entry[0]) {
                return entry[0] as DailyMarketRecord;
              }
              if (entry && typeof entry === "object") {
                const obj = entry as { value?: DailyMarketRecord[] };
                if (Array.isArray(obj.value) && obj.value[0]) {
                  return obj.value[0];
                }
                return entry as DailyMarketRecord;
              }
              return null;
            })
            .filter((x): x is DailyMarketRecord => Boolean(x))
        : [];

      setData({
        marketStatus: value<MarketStatus | null>(0, null),
        marketSummary: value<MarketSummary | null>(1, null),
        aspi: value<IndexData | null>(2, null),
        snp: value<IndexData | null>(3, null),
        topGainers: value<MoverRow[]>(4, []),
        topLosers: value<MoverRow[]>(5, []),
        mostActive: value<ActiveTradeRow[]>(6, []),
        sectors: value<SectorRow[]>(7, []),
        todayPrices: value<TodayPriceRow[]>(8, []),
        dailyHistory,
        approved:
          value<{ approvedAnnouncements?: AnnouncementRow[] }>(10, {})
            .approvedAnnouncements ?? [],
        newListings:
          value<{ newListingRelatedAnnouncements?: AnnouncementRow[] }>(11, {})
            .newListingRelatedAnnouncements ?? [],
        buyIn:
          value<{ buyInBoardAnnouncements?: AnnouncementRow[] }>(12, {})
            .buyInBoardAnnouncements ?? [],
        nonCompliance:
          value<{ nonComplianceAnnouncements?: AnnouncementRow[] }>(13, {})
            .nonComplianceAnnouncements ?? [],
        covid:
          value<{ covidAnnouncements?: AnnouncementRow[] }>(14, {})
            .covidAnnouncements ?? [],
        financial:
          value<{ reqFinancialAnnouncemnets?: DocumentRow[] }>(15, {})
            .reqFinancialAnnouncemnets ?? [],
        circular:
          value<{ reqCircularAnnouncement?: DocumentRow[] }>(16, {})
            .reqCircularAnnouncement ?? [],
        directive:
          value<{ reqDirectiveAnnouncement?: DocumentRow[] }>(17, {})
            .reqDirectiveAnnouncement ?? [],
      });
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      if (mode === "initial") setLoading(false);
      else setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    void load("initial");
  }, [load]);

  // Derived aggregate stats.
  const totals = React.useMemo(() => {
    const advancers = data.topGainers.length;
    const decliners = data.topLosers.length;
    const tradingCompanies = new Set(
      data.todayPrices.map((p) => p.symbol).filter(Boolean),
    ).size;
    const totalSectorTurnover = data.sectors.reduce(
      (sum, s) => sum + (s.sectorTurnoverToday ?? 0),
      0,
    );
    const totalSectorVolume = data.sectors.reduce(
      (sum, s) => sum + (s.sectorVolumeToday ?? 0),
      0,
    );
    return {
      advancers,
      decliners,
      tradingCompanies,
      totalSectorTurnover,
      totalSectorVolume,
    };
  }, [data]);

  const status = data.marketStatus?.status ?? "Unknown";
  const isOpen = /trading|open/i.test(status);
  const isClosed = /closed/i.test(status);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Card size="sm">
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-72" />
              </div>
              <Skeleton className="h-9 w-28" />
            </div>
          </CardContent>
        </Card>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <Card size="sm" className="overflow-hidden">
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(60% 80% at 10% 0%, var(--sidebar-accent) 0%, transparent 60%), radial-gradient(50% 60% at 90% 10%, color-mix(in oklch, var(--primary) 25%, transparent) 0%, transparent 60%)",
            }}
            aria-hidden
          />
          <CardContent className="relative flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="animate-float-y flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary shadow-sm ring-1 ring-primary/20">
                <Megaphone className="size-4" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold leading-tight">
                    Colombo Stock Exchange · Announcements
                  </h1>
                  <Badge
                    variant={isOpen ? "default" : "secondary"}
                    className={cn(
                      "font-medium",
                      isOpen &&
                        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                      isClosed &&
                        "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        isOpen
                          ? "bg-emerald-500 animate-pulse"
                          : isClosed
                            ? "bg-rose-500"
                            : "bg-amber-500",
                      )}
                    />
                    {status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Real-time market indices, mover tables, sector performance
                  and the full announcement firehose from{" "}
                  <a
                    href="https://www.cse.lk"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    cse.lk
                  </a>
                  .
                </p>
                <div className="mt-1 text-xs text-muted-foreground">
                  Last updated{" "}
                  <span className="font-medium text-foreground">
                    {lastUpdated
                      ? lastUpdated.toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {error ? (
                <Badge variant="destructive">
                  <AlertCircle className="size-3" /> {error}
                </Badge>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void load("refresh")}
                disabled={refreshing}
              >
                <RefreshCw
                  className={cn("size-4", refreshing && "animate-spin")}
                />
                Refresh
              </Button>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* Market overview */}
      <MarketOverviewSection
        data={data}
        totals={totals}
        status={status}
        isOpen={isOpen}
        isClosed={isClosed}
      />

      {/* Sector performance */}
      <Card size="sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gauge className="animate-float-y size-4 text-primary" />
            <CardTitle>Sector performance</CardTitle>
          </div>
          <CardDescription>
            All {data.sectors.length} CSE sectors with index value, change and
            today&apos;s turnover. Total sector turnover today:{" "}
            <span className="font-medium text-foreground">
              LKR {fmtCompact(totals.totalSectorTurnover)}
            </span>{" "}
            on{" "}
            <span className="font-medium text-foreground">
              {fmtCompact(totals.totalSectorVolume)}
            </span>{" "}
            shares.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SectorTable rows={data.sectors} />
        </CardContent>
      </Card>

      {/* Daily history */}
      {data.dailyHistory.length > 0 ? (
        <Card size="sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="animate-float-y size-4 text-primary" />
              <CardTitle>Daily market summary history</CardTitle>
            </div>
            <CardDescription>
              Indices, market turnover, trade counts and valuation ratios for
              the most recent CSE trading days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DailyHistoryTable rows={data.dailyHistory} />
          </CardContent>
        </Card>
      ) : null}

      {/* Today's prices */}
      {data.todayPrices.length > 0 ? (
        <Card size="sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="animate-float-y size-4 text-primary" />
                <CardTitle>Today&apos;s share prices</CardTitle>
              </div>
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={priceQuery}
                  onChange={(e) => setPriceQuery(e.target.value)}
                  placeholder="Filter by symbol..."
                  className="pl-8"
                  aria-label="Filter today's share prices"
                />
              </div>
            </div>
            <CardDescription>
              {fmtInt(data.todayPrices.length)} actively-quoted symbols with
              today&apos;s open, high, low and last traded prices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TodayPricesTable rows={data.todayPrices} query={priceQuery} />
          </CardContent>
        </Card>
      ) : null}

      {/* Announcements */}
      <Card size="sm" className="py-0">
        <Tabs
          value={activeAnnTab}
          onValueChange={setActiveAnnTab}
          className="flex flex-col gap-0"
        >
          <div className="border-b px-4 pt-3">
            <div className="flex flex-wrap items-center gap-2 pb-2">
              <Newspaper className="animate-float-y size-4 text-primary" />
              <span className="text-sm font-medium">Announcements</span>
              <Badge variant="outline" className="ml-auto font-normal">
                {data.approved.length +
                  data.newListings.length +
                  data.buyIn.length +
                  data.nonCompliance.length +
                  data.covid.length +
                  data.financial.length +
                  data.circular.length +
                  data.directive.length}{" "}
                items
              </Badge>
            </div>
            <TabsList
              variant="line"
              className="h-9 gap-1 overflow-x-auto md:gap-2"
            >
              <AnnTabTrigger
                value="approved"
                label="Approved"
                count={data.approved.length}
                icon={<CheckCircle2 className="size-3.5" />}
              />
              <AnnTabTrigger
                value="new-listings"
                label="New listings"
                count={data.newListings.length}
                icon={<Newspaper className="size-3.5" />}
              />
              <AnnTabTrigger
                value="buy-in"
                label="Buy-in board"
                count={data.buyIn.length}
                icon={<ChevronRight className="size-3.5" />}
              />
              <AnnTabTrigger
                value="non-compliance"
                label="Non-compliance"
                count={data.nonCompliance.length}
                icon={<ShieldAlert className="size-3.5" />}
              />
              <AnnTabTrigger
                value="financial"
                label="Financial"
                count={data.financial.length}
                icon={<FileText className="size-3.5" />}
              />
              <AnnTabTrigger
                value="circular"
                label="Circular"
                count={data.circular.length}
                icon={<FileText className="size-3.5" />}
              />
              <AnnTabTrigger
                value="directive"
                label="Directive"
                count={data.directive.length}
                icon={<AlertTriangle className="size-3.5" />}
              />
              <AnnTabTrigger
                value="covid"
                label="COVID"
                count={data.covid.length}
                icon={<AlertCircle className="size-3.5" />}
              />
            </TabsList>
          </div>

          <AnnouncementTab
            value="approved"
            rows={data.approved}
            emptyLabel="No approved announcements"
          />
          <AnnouncementTab
            value="new-listings"
            rows={data.newListings}
            emptyLabel="No new listing notices"
          />
          <AnnouncementTab
            value="buy-in"
            rows={data.buyIn}
            emptyLabel="No buy-in board announcements"
          />
          <AnnouncementTab
            value="non-compliance"
            rows={data.nonCompliance}
            emptyLabel="No non-compliance items"
          />
          <DocumentTab
            value="financial"
            rows={data.financial}
            emptyLabel="No financial reports filed"
          />
          <DocumentTab
            value="circular"
            rows={data.circular}
            emptyLabel="No circular notices"
          />
          <DocumentTab
            value="directive"
            rows={data.directive}
            emptyLabel="No directives issued"
          />
          <AnnouncementTab
            value="covid"
            rows={data.covid}
            emptyLabel="No COVID-related announcements"
          />
        </Tabs>
      </Card>

      {/* Movers — below announcements */}
      <Card size="sm" className="py-0">
        <Tabs
          value={activeMoverTab}
          onValueChange={setActiveMoverTab}
          className="flex flex-col gap-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Flame className="animate-float-y size-4 text-primary" />
              <span className="text-sm font-medium">Today&apos;s movers</span>
            </div>
            <TabsList variant="line" className="h-9 gap-2">
              <TabsTrigger value="gainers">
                <TrendingUp className="size-3.5" />
                Gainers
              </TabsTrigger>
              <TabsTrigger value="losers">
                <TrendingDown className="size-3.5" />
                Losers
              </TabsTrigger>
              <TabsTrigger value="active">
                <Activity className="size-3.5" />
                Most active
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="gainers" className="px-4 pb-4 pt-3">
            <MoverList rows={data.topGainers} variant="gainer" />
          </TabsContent>
          <TabsContent value="losers" className="px-4 pb-4 pt-3">
            <MoverList rows={data.topLosers} variant="loser" />
          </TabsContent>
          <TabsContent value="active" className="px-4 pb-4 pt-3">
            <ActiveList rows={data.mostActive} />
          </TabsContent>
        </Tabs>
      </Card>

      {/* Footer */}
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 text-xs text-muted-foreground">
        <span>
          Source data:{" "}
          <a
            href="https://www.cse.lk"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Colombo Stock Exchange (cse.lk)
          </a>
          . This view is unofficial and for informational purposes only.
        </span>
        <span>
          {lastUpdated
            ? `Refreshed at ${lastUpdated.toLocaleString("en-GB")}`
            : null}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab helpers used inside the Announcements card.
// ---------------------------------------------------------------------------

function AnnTabTrigger({
  value,
  label,
  count,
  icon,
}: {
  value: string;
  label: string;
  count: number;
  icon: React.ReactNode;
}) {
  return (
    <TabsTrigger value={value} className="shrink-0">
      {icon}
      <span>{label}</span>
      <Badge
        variant="outline"
        className="ml-1 h-4 min-w-[20px] justify-center px-1 text-[10px]"
      >
        {count}
      </Badge>
    </TabsTrigger>
  );
}

function CappedAnnouncementList<T>({
  items,
  emptyLabel,
  renderItem,
  keyFn,
}: {
  items: T[];
  emptyLabel: string;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyFn: (item: T, index: number) => string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const hasMore = items.length > ANNOUNCEMENT_LIST_LIMIT;
  const visible = expanded ? items : items.slice(0, ANNOUNCEMENT_LIST_LIMIT);

  const scrollDown = () => {
    listRef.current?.scrollBy({ top: 280, behavior: "smooth" });
  };

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={listRef}
        className={cn(
          expanded && hasMore && "max-h-[min(70vh,720px)] overflow-y-auto pr-1",
        )}
      >
        <div className="grid gap-2 md:grid-cols-2">
          {visible.map((item, i) => (
            <React.Fragment key={keyFn(item, i)}>
              {renderItem(item, i)}
            </React.Fragment>
          ))}
        </div>
      </div>
      {hasMore && !expanded ? (
        <div className="flex justify-center border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded(true)}
          >
            <ChevronDown className="size-4" />
            Show {items.length - ANNOUNCEMENT_LIST_LIMIT} more below
          </Button>
        </div>
      ) : null}
      {expanded && hasMore ? (
        <div className="flex justify-center border-t pt-3">
          <Button variant="ghost" size="sm" onClick={scrollDown}>
            <ChevronDown className="size-4" />
            Scroll down
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AnnouncementTab({
  value,
  rows,
  emptyLabel,
}: {
  value: string;
  rows: AnnouncementRow[];
  emptyLabel: string;
}) {
  return (
    <TabsContent value={value} className="px-4 pb-4 pt-3">
      <CappedAnnouncementList
        key={value}
        items={rows}
        emptyLabel={emptyLabel}
        keyFn={(row, i) =>
          `${value}-${row.announcementId ?? "x"}-${row.id ?? "x"}-${i}`
        }
        renderItem={(row) => <AnnouncementCard row={row} />}
      />
    </TabsContent>
  );
}

function DocumentTab({
  value,
  rows,
  emptyLabel,
}: {
  value: string;
  rows: DocumentRow[];
  emptyLabel: string;
}) {
  return (
    <TabsContent value={value} className="px-4 pb-4 pt-3">
      <CappedAnnouncementList
        key={value}
        items={rows}
        emptyLabel={emptyLabel}
        keyFn={(row, i) => `${value}-${row.id ?? "x"}-${row.path ?? i}`}
        renderItem={(row) => <DocumentCard row={row} />}
      />
    </TabsContent>
  );
}
