"use client";

import * as React from "react";
import {
  BarChart3,
  ChartArea,
  ChartLine,
  ChartPie,
  Table2,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/* ────────────────────────────────────────────────────────────────────────── *
 * Renders an actual chart (bar / line / area / pie / donut) from a JSON spec
 * that Robin emits inside a ```chart fenced code block. Pure SVG — no chart
 * library — so it stays light, themeable and dependency-free.
 * ────────────────────────────────────────────────────────────────────────── */

export type ChartType = "bar" | "line" | "area" | "pie" | "donut";

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface ChartSpec {
  type: ChartType;
  title?: string;
  unit?: string;
  categories: string[];
  series: ChartSeries[];
}

const PALETTE = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

/** Validate + coerce an unknown parsed object into a ChartSpec, or null. */
export function toChartSpec(value: unknown): ChartSpec | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;

  const type = String(v.type ?? "bar").toLowerCase();
  if (!["bar", "line", "area", "pie", "donut"].includes(type)) return null;

  const categories = Array.isArray(v.categories)
    ? v.categories.map((c) => String(c))
    : [];

  const rawSeries = Array.isArray(v.series) ? v.series : [];
  const series: ChartSeries[] = rawSeries
    .map((s) => {
      const so = (s ?? {}) as Record<string, unknown>;
      const values = Array.isArray(so.values)
        ? so.values.map((n) => {
            const num =
              typeof n === "number"
                ? n
                : parseFloat(String(n).replace(/[(),%\s]/g, ""));
            return Number.isFinite(num) ? num : 0;
          })
        : [];
      return { name: String(so.name ?? "Series"), values };
    })
    .filter((s) => s.values.length > 0);

  if (categories.length === 0 || series.length === 0) return null;

  return {
    type: type as ChartType,
    title: v.title ? String(v.title) : undefined,
    unit: v.unit ? String(v.unit) : undefined,
    categories,
    series,
  };
}

function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

/** "Nice" rounded upper bound for an axis given a raw max. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const norm = max / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * pow;
}

const TYPE_ICON: Record<ChartType, React.ReactNode> = {
  bar: <BarChart3 className="size-3.5 text-emerald-500" />,
  line: <ChartLine className="size-3.5 text-emerald-500" />,
  area: <ChartArea className="size-3.5 text-emerald-500" />,
  pie: <ChartPie className="size-3.5 text-emerald-500" />,
  donut: <ChartPie className="size-3.5 text-emerald-500" />,
};

export function ChartBlock({ spec }: { spec: ChartSpec }) {
  const [showData, setShowData] = React.useState(false);
  const isPie = spec.type === "pie" || spec.type === "donut";

  return (
    <div className="my-1 w-full rounded-lg border bg-background/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        {TYPE_ICON[spec.type]}
        <span className="flex-1 truncate text-xs font-medium text-foreground">
          {spec.title ?? "Chart"}
          {spec.unit ? (
            <span className="ml-1 font-normal text-muted-foreground">
              ({spec.unit})
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={() => setShowData((s) => !s)}
          className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-emerald-500/40 hover:text-foreground"
        >
          <Table2 className="size-3" />
          {showData ? "Hide data" : "Data"}
        </button>
      </div>

      {isPie ? (
        <PieChart spec={spec} donut={spec.type === "donut"} />
      ) : (
        <CartesianChart spec={spec} />
      )}

      <Legend spec={spec} />

      {showData && <DataTable spec={spec} />}
    </div>
  );
}

/* ───────────────────────── Cartesian (bar / line / area) ───────────────── */

function CartesianChart({ spec }: { spec: ChartSpec }) {
  const W = 600;
  const H = 300;
  const padL = 52;
  const padR = 16;
  const padT = 12;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const allValues = spec.series.flatMap((s) => s.values);
  const rawMax = Math.max(0, ...allValues);
  const rawMin = Math.min(0, ...allValues);
  const top = niceMax(rawMax);
  const bottom = rawMin < 0 ? -niceMax(Math.abs(rawMin)) : 0;
  const range = top - bottom || 1;

  const yOf = (v: number) => padT + plotH - ((v - bottom) / range) * plotH;
  const n = spec.categories.length;
  const slot = plotW / Math.max(n, 1);

  const ticks = 4;
  const tickVals = Array.from(
    { length: ticks + 1 },
    (_, i) => bottom + (range * i) / ticks,
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* gridlines + y labels */}
      {tickVals.map((tv, i) => {
        const y = yOf(tv);
        return (
          <g key={i}>
            <line
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray={tv === 0 ? undefined : "3 3"}
            />
            <text
              x={padL - 8}
              y={y + 3}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {formatNumber(tv)}
            </text>
          </g>
        );
      })}

      {/* category (x-axis) labels */}
      {spec.categories.map((c, i) => (
        <text
          key={i}
          x={padL + slot * (i + 0.5)}
          y={H - padB + 16}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px]"
        >
          {c.length > 10 ? `${c.slice(0, 9)}…` : c}
        </text>
      ))}

      {spec.type === "bar"
        ? renderBars(spec, { yOf, padL, slot, bottom })
        : renderLines(spec, {
            yOf,
            padL,
            slot,
            area: spec.type === "area",
            baseY: yOf(bottom),
          })}
    </svg>
  );
}

function renderBars(
  spec: ChartSpec,
  ctx: { yOf: (v: number) => number; padL: number; slot: number; bottom: number },
) {
  const groups = spec.series.length;
  const groupW = ctx.slot * 0.7;
  const barW = groupW / groups;
  const zeroY = ctx.yOf(0);

  return spec.categories.map((_, ci) => (
    <g key={ci}>
      {spec.series.map((s, si) => {
        const v = s.values[ci] ?? 0;
        const x =
          ctx.padL + ctx.slot * (ci + 0.5) - groupW / 2 + barW * si;
        const y = ctx.yOf(v);
        const h = Math.abs(y - zeroY);
        return (
          <rect
            key={si}
            x={x}
            y={Math.min(y, zeroY)}
            width={Math.max(barW - 2, 1)}
            height={Math.max(h, 0.5)}
            rx={2}
            fill={PALETTE[si % PALETTE.length]}
          >
            <title>{`${spec.categories[ci]} · ${s.name}: ${formatNumber(v)}`}</title>
          </rect>
        );
      })}
    </g>
  ));
}

function renderLines(
  spec: ChartSpec,
  ctx: {
    yOf: (v: number) => number;
    padL: number;
    slot: number;
    area: boolean;
    baseY: number;
  },
) {
  return spec.series.map((s, si) => {
    const color = PALETTE[si % PALETTE.length];
    const pts = s.values.map((v, i) => {
      const x = ctx.padL + ctx.slot * (i + 0.5);
      return { x, y: ctx.yOf(v), v };
    });
    const line = pts.map((p) => `${p.x},${p.y}`).join(" ");
    const areaPath =
      pts.length > 0
        ? `M ${pts[0].x},${ctx.baseY} L ${pts
            .map((p) => `${p.x},${p.y}`)
            .join(" L ")} L ${pts[pts.length - 1].x},${ctx.baseY} Z`
        : "";

    return (
      <g key={si}>
        {ctx.area && (
          <path d={areaPath} fill={color} fillOpacity={0.15} stroke="none" />
        )}
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color}>
            <title>{`${spec.categories[i]} · ${s.name}: ${formatNumber(p.v)}`}</title>
          </circle>
        ))}
      </g>
    );
  });
}

/* ───────────────────────────────── Pie / donut ──────────────────────────── */

function PieChart({ spec, donut }: { spec: ChartSpec; donut: boolean }) {
  // Pie uses the first series; categories become slice labels.
  const values = spec.series[0].values.map((v) => Math.abs(v));
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = 150;
  const cy = 150;
  const r = 120;
  const innerR = donut ? 64 : 0;

  let angle = -Math.PI / 2;
  const slices = values.map((v, i) => {
    const frac = v / total;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    const large = end - start > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);

    let d: string;
    if (innerR > 0) {
      const ix1 = cx + innerR * Math.cos(end);
      const iy1 = cy + innerR * Math.sin(end);
      const ix2 = cx + innerR * Math.cos(start);
      const iy2 = cy + innerR * Math.sin(start);
      d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z`;
    } else {
      d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    }

    const mid = (start + end) / 2;
    const lr = innerR > 0 ? (r + innerR) / 2 : r * 0.62;
    const lx = cx + lr * Math.cos(mid);
    const ly = cy + lr * Math.sin(mid);

    return { d, color: PALETTE[i % PALETTE.length], frac, lx, ly, v };
  });

  return (
    <svg viewBox="0 0 300 300" className="mx-auto h-auto w-full max-w-[300px]" role="img">
      {slices.map((s, i) => (
        <g key={i}>
          <path d={s.d} fill={s.color} stroke="var(--card)" strokeWidth={1.5}>
            <title>{`${spec.categories[i]}: ${formatNumber(s.v)} (${(s.frac * 100).toFixed(1)}%)`}</title>
          </path>
          {s.frac > 0.05 && (
            <text
              x={s.lx}
              y={s.ly}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-white text-[11px] font-medium"
            >
              {(s.frac * 100).toFixed(0)}%
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/* ───────────────────────────────── Legend ───────────────────────────────── */

function Legend({ spec }: { spec: ChartSpec }) {
  const isPie = spec.type === "pie" || spec.type === "donut";
  const items = isPie
    ? spec.categories.map((c, i) => ({ label: c, color: PALETTE[i % PALETTE.length] }))
    : spec.series.map((s, i) => ({ label: s.name, color: PALETTE[i % PALETTE.length] }));

  if (items.length <= 1 && !isPie) return null;

  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1">
      {items.map((it, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
        >
          <span
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ───────────────────────────── Underlying data ──────────────────────────── */

function DataTable({ spec }: { spec: ChartSpec }) {
  return (
    <div className="mt-3 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Category</TableHead>
            {spec.series.map((s, i) => (
              <TableHead key={i} className="text-right text-xs whitespace-nowrap">
                {s.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {spec.categories.map((c, ci) => (
            <TableRow key={ci}>
              <TableCell className="text-xs font-medium">{c}</TableCell>
              {spec.series.map((s, si) => (
                <TableCell key={si} className={cn("text-right text-xs")}>
                  {Intl.NumberFormat("en-US").format(s.values[ci] ?? 0)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
