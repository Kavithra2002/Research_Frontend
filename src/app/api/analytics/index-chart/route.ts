import { NextRequest, NextResponse } from "next/server";

import {
  computeCseYearReturns,
  dailyRowToSnapshot,
  mergeDailySnapshots,
} from "@/lib/cse-index-baselines";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CSE_BASE = "https://www.cse.lk/api";

type CseChartPoint = { d: number; v: number; pc?: number | null };

export type ChartPeriod = "1" | "2" | "3" | "4" | "5";

export type IndexChartPayload = {
  chartId: number;
  period: ChartPeriod;
  points: { time: number; value: number }[];
  liveValue: number | null;
  periodChangePct: number | null;
  returns: {
    priceReturnYear: number | null;
    totalReturnYear: number | null;
    totalReturnAsOf: string | null;
    dividendYield: number | null;
  };
};

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
        Origin: "https://www.cse.lk",
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

function normalizeChartPoints(raw: unknown): CseChartPoint[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    if (raw.length > 0 && Array.isArray(raw[0])) {
      const wrapped = raw[0] as { value?: CseChartPoint[] };
      if (Array.isArray(wrapped?.value)) return wrapped.value;
    }
    return raw as CseChartPoint[];
  }
  if (typeof raw === "object") {
    const obj = raw as { value?: CseChartPoint[] };
    if (Array.isArray(obj.value)) return obj.value;
  }
  return [];
}

function unwrapDailyRows(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (Array.isArray(entry) && entry[0]) return entry[0] as Record<string, unknown>;
      if (entry && typeof entry === "object") {
        const obj = entry as { value?: Record<string, unknown>[] };
        if (Array.isArray(obj.value) && obj.value[0]) return obj.value[0];
        return entry as Record<string, unknown>;
      }
      return null;
    })
    .filter((x): x is Record<string, unknown> => Boolean(x));
}

function pricePrevYearEnd(yearSeries: CseChartPoint[]): number | null {
  const year = new Date().getFullYear();
  const prevYearPoints = yearSeries.filter(
    (p) => new Date(p.d).getFullYear() === year - 1,
  );
  return prevYearPoints.at(-1)?.v ?? null;
}

function periodChangePct(points: CseChartPoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0]?.v;
  const last = points[points.length - 1]?.v;
  if (first == null || last == null || first === 0) return null;
  return ((last - first) / first) * 100;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const chartId = num(url.searchParams.get("chartId"));
  const period = (url.searchParams.get("period") ?? "1") as ChartPeriod;
  const liveParam = num(url.searchParams.get("liveValue"));

  if (chartId == null || !["1", "2", "3", "4", "5"].includes(period)) {
    return NextResponse.json(
      { error: "chartId and period (1–5) are required" },
      { status: 400 },
    );
  }

  const isAspi = chartId === 1;

  const [chartRaw, yearRaw, liveRaw, dailyRaw] = await Promise.all([
    callCSE<unknown>("chartData", {
      chartId: String(chartId),
      period,
    }),
    callCSE<unknown>("chartData", {
      chartId: String(chartId),
      period: "5",
    }),
    liveParam == null
      ? callCSE<{ value?: number }>(isAspi ? "aspiData" : "snpData")
      : Promise.resolve(null),
    callCSE<unknown>("dailyMarketSummery"),
  ]);

  const chartPoints = normalizeChartPoints(chartRaw);
  const yearSeries = normalizeChartPoints(yearRaw);
  const dailyRows = unwrapDailyRows(dailyRaw);
  const store = await mergeDailySnapshots(dailyRows);

  const latestDaily =
    dailyRows
      .map((row) => dailyRowToSnapshot(row))
      .filter((s): s is NonNullable<typeof s> => s != null)
      .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))[0] ?? null;

  const liveValue =
    liveParam ?? num(liveRaw?.value) ?? chartPoints.at(-1)?.v ?? null;

  const payload: IndexChartPayload = {
    chartId,
    period,
    points: chartPoints
      .filter((p) => p.d != null && p.v != null)
      .map((p) => ({ time: p.d, value: p.v })),
    liveValue,
    periodChangePct: periodChangePct(chartPoints),
    returns: computeCseYearReturns({
      isAspi,
      livePrice: liveValue,
      latestDaily,
      pricePrevYearEnd: pricePrevYearEnd(yearSeries),
      store,
    }),
  };

  return NextResponse.json(payload);
}
