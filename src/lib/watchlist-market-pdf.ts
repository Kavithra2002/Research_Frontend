import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { TRADE_SUMMARY_COLUMNS } from "@/lib/market-summary-columns";
import { formatTradeSummaryCell } from "@/lib/trade-summary-export";
import type { TradeSummaryRow } from "@/lib/market-summary-columns";

/* Re-export for callers that imported WatchlistExportRow from here. */
export type WatchlistExportRow = TradeSummaryRow;

export function buildWatchlistMarketPdfBlob(
  watchlistName: string,
  rows: TradeSummaryRow[],
  asOf?: string | null,
  brandLine = "Ambeon Console · Live CSE data",
): Blob {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 28;
  const stamp = (asOf ? new Date(asOf) : new Date()).toLocaleString("en-LK", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`${watchlistName} — Trade Summary`, margin, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110, 116, 128);
  doc.text(`${brandLine} · ${stamp}`, margin, 48);
  doc.setTextColor(0, 0, 0);

  const headers = TRADE_SUMMARY_COLUMNS.map((c) => c.label);
  const body = rows.map((row) =>
    TRADE_SUMMARY_COLUMNS.map((c) => formatTradeSummaryCell(c.id, row)),
  );

  autoTable(doc, {
    startY: 58,
    head: [headers],
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
    headStyles: {
      fillColor: [31, 78, 140],
      textColor: 255,
      fontStyle: "bold",
      fontSize: 7,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    tableWidth: pageW - margin * 2,
  });

  return doc.output("blob");
}

export function downloadWatchlistMarketPdf(
  watchlistName: string,
  rows: TradeSummaryRow[],
  asOf?: string | null,
  brandLine?: string,
) {
  if (typeof window === "undefined") return;
  const blob = buildWatchlistMarketPdfBlob(
    watchlistName,
    rows,
    asOf,
    brandLine,
  );
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const safeName = watchlistName.replace(/[^a-z0-9-_]+/gi, "_");
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}_trade_summary_${date}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
