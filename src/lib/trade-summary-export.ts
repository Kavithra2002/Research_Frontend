import {
  TRADE_SUMMARY_COLUMNS,
  tradeSummaryRawValue,
  type TradeSummaryRow,
} from "@/lib/market-summary-columns";

/* ────────────────────────────────────────────────────────────────────────── *
 * Shared CSV / PDF export helpers for trade summary tables.
 * ────────────────────────────────────────────────────────────────────────── */

const DASH = "—";

function csvCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return DASH;
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtChange(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return DASH;
  return `${v > 0 ? "+" : ""}${fmtNum(v)}`;
}

export function formatTradeSummaryCell(colId: string, row: TradeSummaryRow): string {
  const raw = tradeSummaryRawValue(colId, row);
  switch (colId) {
    case "name":
    case "symbol":
      return String(raw ?? DASH);
    case "shareVolume":
    case "tradeVolume":
      return fmtInt(typeof raw === "number" ? raw : null);
    case "previousClose":
    case "open":
    case "high":
    case "low":
    case "price":
      return fmtNum(typeof raw === "number" ? raw : null);
    case "change":
      return fmtChange(typeof raw === "number" ? raw : null);
    case "changePct":
      return fmtPct(typeof raw === "number" ? raw : null);
    default:
      return raw == null ? DASH : String(raw);
  }
}

export function downloadTradeSummaryCsv(
  watchlistName: string,
  rows: TradeSummaryRow[],
) {
  if (typeof window === "undefined") return;
  const headers = TRADE_SUMMARY_COLUMNS.map((c) => c.label);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      TRADE_SUMMARY_COLUMNS.map((c) =>
        csvCell(tradeSummaryRawValue(c.id, row)),
      ).join(","),
    ),
  ];
  const csv = lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = watchlistName.replace(/[^a-z0-9-_]+/gi, "_");
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}_trade_summary_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
