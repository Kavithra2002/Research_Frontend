import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---------------------------------------------------------------------------
// Live analytics aggregator. Pulls the full equity universe + market context
// from the Colombo Stock Exchange public feed, normalises it into a single
// payload, and serves it to the Analytics screener. The CSE feed needs no API
// key; it is a public, real-time endpoint.
// ---------------------------------------------------------------------------

const CSE_BASE = "https://www.cse.lk/api";
const CDN_BASE = "https://cdn.cse.lk";

async function callCSE<T>(
  endpoint: string,
  params: Record<string, string> = {},
): Promise<T | null> {
  try {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) form.set(k, v);
    }
    const res = await fetch(`${CSE_BASE}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (compatible; AmbeonConsole/1.0; +https://www.cse.lk)",
      },
      body: form.toString(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function logoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.replace(/^\/+/, "");
  if (trimmed.startsWith("cmt/")) return `${CDN_BASE}/${trimmed}`;
  return `${CDN_BASE}/cmt/${trimmed}`;
}

function ticker(symbol: string | null | undefined): string {
  if (!symbol) return "";
  return symbol.split(".")[0];
}

// --- CSE response shapes (only the fields we consume) ----------------------

type TradeSummaryRow = {
  symbol?: string;
  name?: string;
  logoUrl?: string | null;
  price?: number;
  previousClose?: number;
  change?: number;
  percentageChange?: number;
  open?: number;
  high?: number;
  low?: number;
  turnover?: number;
  sharevolume?: number;
  tradevolume?: number;
  marketCap?: number;
  marketCapPercentage?: number;
};

type IndexData = {
  value?: number;
  change?: number;
  percentage?: number;
  lowValue?: number;
  highValue?: number;
};

type MarketSummary = {
  tradeVolume?: number;
  shareVolume?: number;
  trades?: number;
  tradeDate?: number;
};

type SectorRow = {
  symbol?: string;
  name?: string;
  indexName?: string;
  indexValue?: number;
  change?: number;
  percentage?: number;
  sectorTradeToday?: number;
  sectorVolumeToday?: number;
  sectorTurnoverToday?: number;
};

export async function GET() {
  try {
    const [trade, aspi, snp, summary, status, sectors] = await Promise.all([
      callCSE<{ reqTradeSummery?: TradeSummaryRow[] }>("tradeSummary"),
      callCSE<IndexData>("aspiData"),
      callCSE<IndexData>("snpData"),
      callCSE<MarketSummary>("marketSummery"),
      callCSE<{ status?: string }>("marketStatus"),
      callCSE<SectorRow[]>("allSectors"),
    ]);

    const rawRows = trade?.reqTradeSummery ?? [];

    const universe = rawRows
      .map((r) => {
        const price = num(r.price);
        const high = num(r.high);
        const low = num(r.low);
        const rangePct =
          high != null && low != null && price && price > 0
            ? ((high - low) / price) * 100
            : null;
        return {
          symbol: r.symbol ?? "",
          ticker: ticker(r.symbol),
          name: r.name ?? ticker(r.symbol),
          logoUrl: logoUrl(r.logoUrl),
          price,
          previousClose: num(r.previousClose),
          change: num(r.change),
          changePct: num(r.percentageChange),
          open: num(r.open),
          high,
          low,
          rangePct,
          turnover: num(r.turnover),
          shareVolume: num(r.sharevolume),
          tradeVolume: num(r.tradevolume),
          marketCap: num(r.marketCap),
          marketCapPct: num(r.marketCapPercentage),
        };
      })
      .filter((r) => r.symbol);

    let advancers = 0;
    let decliners = 0;
    let unchanged = 0;
    for (const r of universe) {
      if (r.changePct == null || r.changePct === 0) unchanged += 1;
      else if (r.changePct > 0) advancers += 1;
      else decliners += 1;
    }

    const sectorRows = (sectors ?? [])
      .map((s) => ({
        symbol: s.symbol ?? "",
        name: s.name ?? "",
        indexName: s.indexName ?? "",
        value: num(s.indexValue),
        change: num(s.change),
        percentage: num(s.percentage),
        trades: num(s.sectorTradeToday),
        volume: num(s.sectorVolumeToday),
        turnover: num(s.sectorTurnoverToday),
      }))
      .filter((s) => s.name);

    return NextResponse.json({
      asOf: new Date().toISOString(),
      marketStatus: status?.status ?? null,
      indices: {
        aspi: aspi
          ? {
              value: num(aspi.value),
              change: num(aspi.change),
              percentage: num(aspi.percentage),
              low: num(aspi.lowValue),
              high: num(aspi.highValue),
            }
          : null,
        snp: snp
          ? {
              value: num(snp.value),
              change: num(snp.change),
              percentage: num(snp.percentage),
              low: num(snp.lowValue),
              high: num(snp.highValue),
            }
          : null,
      },
      summary: summary
        ? {
            turnover: num(summary.tradeVolume),
            shareVolume: num(summary.shareVolume),
            trades: num(summary.trades),
          }
        : null,
      breadth: { advancers, decliners, unchanged },
      universe,
      sectors: sectorRows,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        universe: [],
        sectors: [],
      },
      { status: 502 },
    );
  }
}
