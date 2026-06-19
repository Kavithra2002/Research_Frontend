/** Full CSE trade summary columns (matches Analytics CSV export). */
export const TRADE_SUMMARY_COLUMNS = [
  { id: "name", label: "Company Name" },
  { id: "symbol", label: "Symbol" },
  { id: "shareVolume", label: "Share Volume" },
  { id: "tradeVolume", label: "Trade Volume" },
  { id: "previousClose", label: "Previous Close (Rs.)" },
  { id: "open", label: "Open (Rs.)" },
  { id: "high", label: "High (Rs.)" },
  { id: "low", label: "Low (Rs.)" },
  { id: "price", label: "Last Trade (Rs.)" },
  { id: "change", label: "Change (Rs.)" },
  { id: "changePct", label: "Change (%)" },
] as const;

export type TradeSummaryColumnId = (typeof TRADE_SUMMARY_COLUMNS)[number]["id"];

/** Alias used by Jone configuration and market-summary tooling. */
export const MARKET_SUMMARY_COLUMNS = TRADE_SUMMARY_COLUMNS;

export type MarketSummaryColumnId = TradeSummaryColumnId;

export const ALL_TRADE_SUMMARY_COLUMN_IDS: TradeSummaryColumnId[] =
  TRADE_SUMMARY_COLUMNS.map((c) => c.id);

export type TradeSummaryRow = {
  name: string;
  symbol: string;
  shareVolume: number | null;
  tradeVolume: number | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  price: number | null;
  change: number | null;
  changePct: number | null;
};

export function tradeSummaryRawValue(
  colId: string,
  row: TradeSummaryRow,
): string | number | null {
  switch (colId) {
    case "name":
      return row.name;
    case "symbol":
      return row.symbol;
    case "shareVolume":
      return row.shareVolume;
    case "tradeVolume":
      return row.tradeVolume;
    case "previousClose":
      return row.previousClose;
    case "open":
      return row.open;
    case "high":
      return row.high;
    case "low":
      return row.low;
    case "price":
      return row.price;
    case "change":
      return row.change;
    case "changePct":
      return row.changePct;
    default:
      return null;
  }
}

export function toTradeSummaryRow(input: {
  name: string;
  symbol: string;
  shareVolume?: number | null;
  tradeVolume?: number | null;
  previousClose?: number | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  price?: number | null;
  change?: number | null;
  changePct?: number | null;
}): TradeSummaryRow {
  return {
    name: input.name,
    symbol: input.symbol,
    shareVolume: input.shareVolume ?? null,
    tradeVolume: input.tradeVolume ?? null,
    previousClose: input.previousClose ?? null,
    open: input.open ?? null,
    high: input.high ?? null,
    low: input.low ?? null,
    price: input.price ?? null,
    change: input.change ?? null,
    changePct: input.changePct ?? null,
  };
}
