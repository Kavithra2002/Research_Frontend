"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  Activity,
  ArrowUp,
  ChevronDown,
  Loader2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChartPeriod } from "@/app/api/analytics/index-chart/route";

export type LivePoint = { time: number; value: number };

const PERIODS: { id: ChartPeriod; label: string }[] = [
  { id: "1", label: "One Day" },
  { id: "2", label: "One Week" },
  { id: "3", label: "One Month" },
  { id: "4", label: "Quarterly" },
  { id: "5", label: "One Year" },
];

const THEME = {
  dark: {
    text: "#a1a1aa",
    grid: "rgba(63, 63, 70, 0.35)",
    border: "rgba(63, 63, 70, 0.5)",
  },
  light: {
    text: "#52525b",
    grid: "rgba(228, 228, 231, 0.8)",
    border: "rgba(212, 212, 216, 0.9)",
  },
};

const UP_COLOR = "#10b981";
const DOWN_COLOR = "#ef4444";

function fmtNum(v: number, digits = 2): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPct(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtChartTime(ms: number, period: ChartPeriod): string {
  const d = new Date(ms);
  if (period === "1") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (period === "5") {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function toSeriesData(
  points: LivePoint[],
): { time: UTCTimestamp; value: number }[] {
  const byKey = new Map<number, number>();
  for (const p of points) {
    byKey.set(p.time, p.value);
  }
  return [...byKey.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({
      time: Math.floor(time / 1000) as UTCTimestamp,
      value,
    }));
}

type YearReturns = {
  priceReturnYear: number | null;
  totalReturnYear: number | null;
  totalReturnAsOf?: string | null;
};

function ReturnRow({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  if (value == null || Number.isNaN(value)) {
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">—</span>
      </div>
    );
  }
  const up = value > 0;
  const flat = value === 0;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="text-foreground/90">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-semibold tabular-nums",
          flat && "text-muted-foreground",
          up && !flat && "text-emerald-600 dark:text-emerald-400",
          !up && !flat && "text-rose-600 dark:text-rose-400",
        )}
      >
        <span
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-full",
            flat && "bg-muted",
            up && !flat && "bg-emerald-500",
            !up && !flat && "bg-rose-500",
          )}
        >
          <ArrowUp
            className={cn(
              "size-3 text-white",
              !up && !flat && "rotate-180",
              flat && "hidden",
            )}
          />
        </span>
        {fmtPct(value)}
      </span>
    </div>
  );
}

export function IndexStatisticsChart({
  chartId,
  statisticsTitle,
  indexLabel,
  subtitle,
  liveValue,
  liveChangePct,
  marketOpen,
  onRefresh,
  refreshing,
}: {
  chartId: number;
  statisticsTitle: string;
  indexLabel: string;
  subtitle?: string;
  liveValue: number | null;
  liveChangePct?: number | null;
  marketOpen: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  const [period, setPeriod] = React.useState<ChartPeriod>("1");
  const [points, setPoints] = React.useState<LivePoint[]>([]);
  const [periodChangePct, setPeriodChangePct] = React.useState<number | null>(
    null,
  );
  const [yearReturns, setYearReturns] = React.useState<YearReturns>({
    priceReturnYear: null,
    totalReturnYear: null,
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
  const didFitRef = React.useRef(false);
  const periodRef = React.useRef<ChartPeriod>("1");

  const displayValue = liveValue ?? points.at(-1)?.value ?? null;
  const changePct =
    period === "1" && liveChangePct != null ? liveChangePct : periodChangePct;
  const up = (changePct ?? 0) > 0;
  const flat = changePct === 0 || changePct == null;
  const lineColor = flat ? UP_COLOR : up ? UP_COLOR : DOWN_COLOR;

  const loadChart = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        chartId: String(chartId),
        period,
      });
      if (liveValue != null) qs.set("liveValue", String(liveValue));
      const res = await fetch(`/api/analytics/index-chart?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load chart");
      const json = (await res.json()) as {
        points?: LivePoint[];
        periodChangePct?: number | null;
        returns?: YearReturns;
        error?: string;
      };
      if (json.error) throw new Error(json.error);
      setPoints(json.points ?? []);
      setPeriodChangePct(json.periodChangePct ?? null);
      if (json.returns) setYearReturns(json.returns);
      didFitRef.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chart");
      setPoints([]);
      setPeriodChangePct(null);
    } finally {
      setLoading(false);
    }
  }, [chartId, period, liveValue]);

  React.useEffect(() => {
    void loadChart();
  }, [loadChart]);

  React.useEffect(() => {
    periodRef.current = period;
  }, [period]);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: THEME.dark.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: THEME.dark.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      leftPriceScale: {
        visible: true,
        borderColor: THEME.dark.border,
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      rightPriceScale: { visible: false },
      timeScale: {
        borderColor: THEME.dark.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) =>
          fmtChartTime((time as number) * 1000, periodRef.current),
      },
      localization: {
        timeFormatter: (time: Time) =>
          fmtChartTime((time as number) * 1000, periodRef.current),
      },
      handleScroll: true,
      handleScale: true,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: UP_COLOR,
      topColor: "rgba(16, 185, 129, 0.35)",
      bottomColor: "rgba(16, 185, 129, 0.02)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      pointMarkersVisible: true,
      pointMarkersRadius: periodRef.current === "1" ? 4 : 3,
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const t = isDark ? THEME.dark : THEME.light;
    chart.applyOptions({
      layout: {
        textColor: t.text,
        background: { type: ColorType.Solid, color: "transparent" },
      },
      grid: { horzLines: { color: t.grid } },
      leftPriceScale: { borderColor: t.border },
      timeScale: {
        borderColor: t.border,
        tickMarkFormatter: (time: Time) =>
          fmtChartTime((time as number) * 1000, period),
      },
    });
  }, [isDark, period]);

  React.useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;

    series.applyOptions({
      lineColor,
      topColor:
        lineColor === DOWN_COLOR
          ? "rgba(239, 68, 68, 0.30)"
          : "rgba(16, 185, 129, 0.35)",
      bottomColor:
        lineColor === DOWN_COLOR
          ? "rgba(239, 68, 68, 0.02)"
          : "rgba(16, 185, 129, 0.02)",
      pointMarkersVisible: period === "1",
      pointMarkersRadius: period === "1" ? 4 : 0,
    });

    series.setData(toSeriesData(points));

    if (!didFitRef.current && points.length >= 2) {
      chart.timeScale().fitContent();
      didFitRef.current = true;
    }
  }, [points, lineColor, period]);

  const hasData = points.length >= 2;
  const last = points.at(-1);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full",
            flat && "bg-muted",
            up && !flat && "bg-emerald-500/15",
            !up && !flat && "bg-rose-500/15",
          )}
        >
          {flat ? (
            <Activity className="size-3.5 text-muted-foreground" />
          ) : up ? (
            <TrendingUp className="size-3.5 text-emerald-500" />
          ) : (
            <TrendingDown className="size-3.5 text-rose-500" />
          )}
        </span>
        <span className="text-sm font-semibold text-foreground">
          {statisticsTitle}
        </span>
        {period === "1" ? (
          <span
            className={cn(
              "ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              marketOpen
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "inline-block size-1.5 rounded-full",
                marketOpen
                  ? "animate-pulse bg-emerald-500"
                  : "bg-muted-foreground",
              )}
            />
            {marketOpen ? "Live" : "Closed"}
          </span>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="px-4 py-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              {displayValue != null ? (
                <>
                  <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                    {fmtNum(displayValue)}
                  </span>
                  {changePct != null ? (
                    <div
                      className={cn(
                        "flex flex-wrap items-center gap-2 text-sm font-medium tabular-nums",
                        flat && "text-muted-foreground",
                        up && !flat && "text-emerald-600 dark:text-emerald-400",
                        !up && !flat && "text-rose-600 dark:text-rose-400",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex size-5 items-center justify-center rounded-full",
                          flat && "bg-muted",
                          up && !flat && "bg-emerald-500",
                          !up && !flat && "bg-rose-500",
                        )}
                      >
                        <ArrowUp
                          className={cn(
                            "size-3 text-white",
                            !up && !flat && "rotate-180",
                            flat && "hidden",
                          )}
                        />
                      </span>
                      <span>{fmtPct(changePct)}</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <span className="text-2xl font-bold text-muted-foreground">
                  —
                </span>
              )}
              {subtitle ? (
                <span className="text-[11px] text-muted-foreground">
                  {indexLabel} · {subtitle}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  {indexLabel}
                </span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="icon-sm"
                onClick={() => {
                  void loadChart();
                  onRefresh?.();
                }}
                disabled={refreshing || loading}
                aria-label="Refresh chart"
                title="Refresh now"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {refreshing || loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </Button>
              <div className="relative">
                <select
                  className="h-8 min-w-[108px] appearance-none rounded-md border border-input bg-background pr-7 pl-2.5 text-xs text-foreground"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as ChartPeriod)}
                  aria-label="Chart time range"
                >
                  {PERIODS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
          </div>

          <div className="relative">
            <span
              className="pointer-events-none absolute top-1/2 left-0 z-10 -translate-y-1/2 -rotate-90 text-[10px] font-medium tracking-wide text-muted-foreground uppercase select-none"
              style={{ transformOrigin: "center center" }}
            >
              Values
            </span>
            <div ref={containerRef} className="h-[240px] w-full pl-5" />

            {loading && !hasData ? (
              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/40 pl-5">
                <div className="h-full w-full animate-pulse rounded-md bg-muted" />
              </div>
            ) : error && !hasData ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/20 pl-5 text-center">
                <p className="text-sm text-rose-600 dark:text-rose-400">
                  {error}
                </p>
              </div>
            ) : !hasData ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/20 pl-5 text-center">
                <Activity className="size-5 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No chart data for this range
                </p>
              </div>
            ) : null}
          </div>

          {last ? (
            <div className="mt-2 text-[10px] text-muted-foreground">
              {points.length} points · scroll to zoom, drag to pan · Updated{" "}
              {fmtChartTime(last.time, period)}
            </div>
          ) : null}
        </div>

        <div className="divide-y border-t bg-muted/30">
          <ReturnRow
            label={`Return for ${indexLabel} for the year`}
            value={yearReturns.priceReturnYear}
          />
          <ReturnRow
            label={`Total Return for ${indexLabel} for the year *`}
            value={yearReturns.totalReturnYear}
          />
        </div>
      </div>
    </div>
  );
}
