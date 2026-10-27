import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type {
  ExtractedStatement,
  ExtractedTable,
} from "@/components/extracted/extracted-tables-view";
import { statementLabel } from "@/lib/statement-types";

export type ExtractedExportMeta = {
  companyName: string;
  year?: number | null;
  period?: string | null;
  quarter?: string | null;
};

function safeFilenamePart(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function buildBaseName(meta: ExtractedExportMeta) {
  const parts = [
    safeFilenamePart(meta.companyName || "extracted"),
    meta.year != null ? String(meta.year) : null,
    meta.period ? safeFilenamePart(meta.period) : null,
    meta.quarter ? safeFilenamePart(meta.quarter) : null,
    "extracted_tables",
  ].filter(Boolean);
  return parts.join("_");
}

function triggerDownload(blob: Blob, filename: string) {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function tableColCount(table: ExtractedTable) {
  const headerRows = table.header_rows ?? [];
  const rows = table.rows ?? [];
  return Math.max(
    ...headerRows.map((r) => r.length),
    ...rows.map((r) => r.cells?.length ?? 0),
    1,
  );
}

function padCells(cells: string[], colCount: number) {
  return Array.from({ length: colCount }, (_, i) => String(cells[i] ?? ""));
}

function tableMatrix(table: ExtractedTable): string[][] {
  const colCount = tableColCount(table);
  const matrix: string[][] = [];
  for (const row of table.header_rows ?? []) {
    matrix.push(padCells(row.map((c) => String(c ?? "")), colCount));
  }
  for (const row of table.rows ?? []) {
    if ((row.style ?? "data") === "blank") continue;
    matrix.push(padCells((row.cells ?? []).map((c) => String(c ?? "")), colCount));
  }
  return matrix;
}

function exportTitle(meta: ExtractedExportMeta) {
  const bits = [
    meta.companyName,
    meta.year != null ? String(meta.year) : null,
    meta.period,
    meta.quarter,
  ].filter(Boolean);
  return bits.join(" · ");
}

function statementsWithTables(statements: ExtractedStatement[]) {
  return statements.filter(
    (s) =>
      s.status !== "error" &&
      (s.data?.tables?.length ?? 0) > 0,
  );
}

/* ── PDF ─────────────────────────────────────────────────────────────────── */

export function downloadExtractedTablesPdf(
  statements: ExtractedStatement[],
  meta: ExtractedExportMeta,
) {
  const usable = statementsWithTables(statements);
  if (usable.length === 0) return;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 28;
  const stamp = new Date().toLocaleString("en-LK", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  usable.forEach((statement, stmtIdx) => {
    if (stmtIdx > 0) doc.addPage();

    const label = statementLabel(statement.key, statement.title);
    let y = 34;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(label, margin, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110, 116, 128);
    doc.text(
      `${exportTitle(meta)} · Ambeon Console · ${stamp}`,
      margin,
      y,
    );
    y += 10;

    if (statement.data?.statement_title) {
      doc.setFontSize(8);
      doc.text(statement.data.statement_title, margin, y, {
        maxWidth: pageW - margin * 2,
      });
      y += 12;
    }

    if (statement.data?.preamble) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      const preambleLines = doc.splitTextToSize(
        statement.data.preamble,
        pageW - margin * 2,
      );
      doc.text(preambleLines, margin, y);
      y += preambleLines.length * 9 + 6;
      doc.setFont("helvetica", "normal");
    }

    (statement.data?.tables ?? []).forEach((table, tableIdx) => {
      const matrix = tableMatrix(table);
      if (matrix.length === 0) return;

      const headerCount = (table.header_rows ?? []).length;
      const head =
        headerCount > 0 ? matrix.slice(0, headerCount) : undefined;
      const body =
        headerCount > 0 ? matrix.slice(headerCount) : matrix;

      if (tableIdx > 0) {
        const lastY =
          (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable
            ?.finalY ?? y;
        y = lastY + 16;
        if (y > pageH - 80) {
          doc.addPage();
          y = 34;
        }
      }

      if (table.caption) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(40, 40, 40);
        doc.text(table.caption, margin, y);
        y += 10;
        doc.setFont("helvetica", "normal");
      }

      autoTable(doc, {
        startY: y,
        head: head && head.length > 0 ? head : undefined,
        body: body.length > 0 ? body : [["—"]],
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 6.5,
          cellPadding: 2.5,
          overflow: "linebreak",
          valign: "top",
        },
        headStyles: {
          fillColor: [31, 78, 140],
          textColor: 255,
          fontStyle: "bold",
          fontSize: 6.5,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        tableWidth: pageW - margin * 2,
      });

      y =
        (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable
          ?.finalY ?? y;
    });

    if (statement.data?.footnotes) {
      const lastY =
        (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable
          ?.finalY ?? y;
      let noteY = lastY + 14;
      if (noteY > pageH - 60) {
        doc.addPage();
        noteY = 34;
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(110, 116, 128);
      const noteLines = doc.splitTextToSize(
        statement.data.footnotes,
        pageW - margin * 2,
      );
      doc.text(noteLines, margin, noteY);
    }
  });

  const blob = doc.output("blob");
  triggerDownload(blob, `${buildBaseName(meta)}.pdf`);
}

/* ── CSV ─────────────────────────────────────────────────────────────────── */

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(cells: string[]) {
  return cells.map(csvCell).join(",");
}

export function buildExtractedTablesCsvText(
  statements: ExtractedStatement[],
  meta: ExtractedExportMeta,
): string | null {
  const usable = statementsWithTables(statements);
  if (usable.length === 0) return null;

  const lines: string[] = [];
  lines.push(csvRow([exportTitle(meta)]));
  lines.push("");

  usable.forEach((statement, stmtIdx) => {
    const label = statementLabel(statement.key, statement.title);
    if (stmtIdx > 0) lines.push("");
    lines.push(csvRow([label]));
    if (statement.data?.statement_title) {
      lines.push(csvRow([statement.data.statement_title]));
    }
    if (statement.data?.preamble) {
      lines.push(csvRow([statement.data.preamble]));
    }

    (statement.data?.tables ?? []).forEach((table, tableIdx) => {
      const matrix = tableMatrix(table);
      if (matrix.length === 0) return;
      if (tableIdx > 0) lines.push("");
      if (table.caption) lines.push(csvRow([table.caption]));
      for (const row of matrix) {
        lines.push(csvRow(row));
      }
    });

    if (statement.data?.footnotes) {
      lines.push("");
      lines.push(csvRow(["Footnotes", statement.data.footnotes]));
    }
  });

  return lines.join("\r\n");
}

export function downloadExtractedTablesCsv(
  statements: ExtractedStatement[],
  meta: ExtractedExportMeta,
) {
  const text = buildExtractedTablesCsvText(statements, meta);
  if (!text) return;
  // BOM so Excel opens UTF-8 correctly.
  const blob = new Blob(["\uFEFF" + text], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, `${buildBaseName(meta)}.csv`);
}
