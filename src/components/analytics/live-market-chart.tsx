"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  Activity,
  ArrowUp,
  ChevronDown,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LivePoint = { time: number; value: number };

function fmtNum(v: number, digits = 2): string {
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Map ms-based points → strictly-ascending, unique, second-based chart data. */
function toSeriesData(points: LivePoint[]): { time: UTCTimestamp; value: number }[] {
  const bySecond = new Map<number, number>();
  for (const p of points) {
    const t = Math.floor(p.time / 1000);
    bySecond.set(t, p.value);
  }
  return [...bySecond.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}

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

export function LiveMarketChart({
  statisticsTitle,
  title,
  subtitle,
  points,
  marketOpen,
  reference,
  loading,
  onRefresh,
  refreshing,
}: {
  statisticsTitle: string;
  title: string;
  subtitle?: string;
  points: LivePoint[];
  marketOpen: boolean;
  reference?: number | null;
  loading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
  const priceLineRef = React.useRef<IPriceLine | null>(null);
  const didFitRef = React.useRef(false);

  const last = points[points.length - 1];
  const first = points[0];
  const change =
    last && first && points.length > 1 ? last.value - first.value : null;
  const changePct =
    last && first && first.value !== 0 && points.length > 1
      ? ((last.value - first.value) / first.value) * 100
      : null;
  const up = (change ?? 0) > 0;
  const flat = change === 0 || change == null;
  const lineColor = flat ? UP_COLOR : up ? UP_COLOR : DOWN_COLOR;

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
          fmtTime((time as number) * 1000),
      },
      localization: {
        timeFormatter: (time: Time) => fmtTime((time as number) * 1000),
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
      pointMarkersRadius: 4,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    didFitRef.current = false;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLineRef.current = null;
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
      timeScale: { borderColor: t.border },
    });
  }, [isDark]);

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
    });

    series.setData(toSeriesData(points));

    if (!didFitRef.current && points.length >= 2) {
      chart.timeScale().fitContent();
      didFitRef.current = true;
    }
  }, [points, lineColor]);

  React.useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (priceLineRef.current) {
      series.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
    }
    if (reference != null) {
      priceLineRef.current = series.createPriceLine({
        price: reference,
        color: isDark ? "#71717a" : "#a1a1aa",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "Prev close",
      });
    }
  }, [reference, isDark, points.length]);

  const hasData = points.length >= 2;

  return (
    <div className="flex flex-col gap-2">
      {/* Section header — matches CSE "ASPI Statistics" style */}
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
      </div>

      <div className="rounded-xl border bg-card px-4 py-3 shadow-sm">
        {/* Value + controls row */}
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {last ? (
              <>
                <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
                  {fmtNum(last.value)}
                </span>
                {change != null && changePct != null ? (
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
                    <span>{fmtNum(Math.abs(change))}</span>
                    <span>
                      {changePct > 0 ? "+" : ""}
                      {changePct.toFixed(2)}%
                    </span>
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
                {title} · {subtitle}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">{title}</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {onRefresh ? (
              <Button
                type="button"
                size="icon-sm"
                onClick={onRefresh}
                disabled={refreshing}
                aria-label="Refresh chart"
                title="Refresh now"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {refreshing ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </Button>
            ) : null}
            <div className="relative">
              <select
                className="h-8 appearance-none rounded-md border border-input bg-background pr-7 pl-2.5 text-xs text-foreground"
                defaultValue="1d"
                aria-label="Chart time range"
              >
                <option value="1d">One Day</option>
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Chart with left "Values" axis label */}
        <div className="relative">
          <span
            className="pointer-events-none absolute top-1/2 left-0 z-10 -translate-y-1/2 -rotate-90 text-[10px] font-medium tracking-wide text-muted-foreground uppercase select-none"
            style={{ transformOrigin: "center center" }}
          >
            Values
          </span>
          <div ref={containerRef} className="h-[240px] w-full pl-5" />

          {loading && points.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/40 pl-5">
              <div className="h-full w-full animate-pulse rounded-md bg-muted" />
            </div>
          ) : !hasData ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-muted/20 pl-5 text-center">
              <Activity className="size-5 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {marketOpen
                  ? "Building intraday chart — a new point is added every 30s"
                  : "Market is closed — chart resumes when trading reopens"}
              </p>
              {last ? (
                <p className="text-xs text-muted-foreground">
                  Last: {fmtNum(last.value)} at {fmtTime(last.time)}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>
            {points.length} samples today · scroll to zoom, drag to pan
          </span>
          {last ? <span>Updated {fmtTime(last.time)}</span> : null}
        </div>
      </div>
    </div>
  );
}
