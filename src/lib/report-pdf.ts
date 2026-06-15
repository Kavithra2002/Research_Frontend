import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { parseSegments } from "@/components/ai/chat-markdown";
import type { ChartSpec } from "@/components/ai/chart-block";

/* ────────────────────────────────────────────────────────────────────────── *
 * Build a clean PDF report from a Robin assistant message.
 *
 * We render from the message's STRUCTURED segments (text / table / chart) rather
 * than screenshotting the DOM, so:
 *   • tables come out fully expanded (not the collapsed "View table" chip),
 *   • chart data is included as a labelled table,
 *   • the layout is consistent and selectable/searchable text.
 * ────────────────────────────────────────────────────────────────────────── */

export interface ReportPdfMeta {
  title?: string;
  author?: string;
  generatedAt?: Date;
  /** Brand shown in the header sub-line and footer (defaults to "Ambeon Console"). */
  brand?: string;
  /** PNG/JPEG data URL of a logo to render at the top of the report. */
  logoDataUrl?: string;
  /**
   * PNG/JPEG data URLs of brand logos rendered right-aligned at the very top of
   * the report header, drawn left→right in array order (so the last entry sits
   * furthest right). Mirrors the Ambeon Securities + Sherwood header used in the
   * Daily Market Wrap (Marian) report.
   */
  headerLogoDataUrls?: string[];
  /**
   * PNG/JPEG data URL of the agent avatar, rendered as a circle to the left of
   * the report title (mirrors the circular avatar shown in the frontend).
   */
  avatarDataUrl?: string;
  /** Accent colour used for the avatar ring and header divider. */
  accentColor?: [number, number, number];
}

/**
 * Brand logos shown in the report header (right-aligned). Only the Ambeon
 * Securities mark is rendered — the same logo used across the reports.
 */
export const BRAND_LOGO_SRCS = [
  "/logo_Ambeon_sec_trim.png",
] as const;

/** Load the brand header logos as data URLs, dropping any that fail to load. */
export async function loadBrandLogoDataUrls(): Promise<string[]> {
  const loaded = await Promise.all(
    BRAND_LOGO_SRCS.map((src) => loadImageDataUrl(src)),
  );
  return loaded.filter((d): d is string => typeof d === "string");
}

/**
 * Load an image URL (e.g. "/company_logo.png") into a PNG data URL so it can be
 * embedded in a jsPDF document. Resolves to `null` if the image can't be loaded.
 */
export async function loadImageDataUrl(url: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const MARGIN = 48;
const LINE_HEIGHT = 15;
const EMERALD: [number, number, number] = [16, 185, 129];
const MUTED: [number, number, number] = [110, 116, 128];
const LEFT_BAR_W = 12; // colored spine down the left edge of every page
const NAVY: [number, number, number] = [31, 78, 140]; // Ambeon brand blue
const ORANGE: [number, number, number] = [226, 114, 40]; // Ambeon brand orange

/** Draw the navy spine with an orange accent block down the left edge. */
function drawLeftBar(doc: jsPDF, pageH: number) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, LEFT_BAR_W, pageH, "F");
  doc.setFillColor(...ORANGE);
  doc.rect(0, pageH * 0.1, LEFT_BAR_W, pageH * 0.16, "F");
}

/**
 * Normalise text for jsPDF's built-in Helvetica.
 *
 * jsPDF ships only WinAnsi glyph-width metrics, so characters outside that set
 * (fancy unicode spaces, zero-width joiners, "×", smart quotes, …) get a wrong
 * or zero advance width. That makes `splitTextToSize` pack too much onto a line
 * and the renderer stretches the glyphs — the "letters spread across the page /
 * running off the edge" effect. We fold those into safe ASCII equivalents and
 * collapse stray whitespace so the layout stays clean.
 */
function sanitizeForPdf(text: string): string {
  return (
    text
      // Remove zero-width / invisible characters entirely.
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      // Collapse every flavour of unicode space into a normal space.
      .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      // Common math / typographic symbols → ASCII.
      .replace(/[×✕✖]/g, "x")
      .replace(/[≈]/g, "~")
      .replace(/[≤]/g, "<=")
      .replace(/[≥]/g, ">=")
      .replace(/[‐‑‒–]/g, "-")
      .replace(/[—―]/g, " - ")
      .replace(/[’‘‚]/g, "'")
      .replace(/[“”„]/g, '"')
      .replace(/[•·∙▪‣]/g, "•")
      .replace(/…/g, "...")
      // Tidy up doubled spaces and spaces before punctuation.
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ +([,.;:%)])/g, "$1")
      .trim()
  );
}

/** Strip inline markdown (**bold**, leading #/-/* markers) for plain PDF text. */
function stripInline(text: string): string {
  return sanitizeForPdf(
    text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1"),
  );
}

/**
 * Draw an image clipped to a circle, with an accent ring around it — the same
 * look as the round agent avatars in the frontend.
 */
function addCircularImage(
  doc: jsPDF,
  dataUrl: string,
  cx: number,
  cy: number,
  r: number,
  ring: [number, number, number],
) {
  const fmt = dataUrl.includes("image/jpeg") ? "JPEG" : "PNG";
  doc.saveGraphicsState();
  // Build a circular path (style `null` postpones painting) and use it as a clip.
  doc.circle(cx, cy, r, null as unknown as undefined);
  doc.clip();
  doc.discardPath();
  doc.addImage(dataUrl, fmt, cx - r, cy - r, r * 2, r * 2, undefined, "FAST");
  doc.restoreGraphicsState();
  // Accent ring on top of the clipped image.
  doc.setDrawColor(...ring);
  doc.setLineWidth(1.5);
  doc.circle(cx, cy, r, "S");
}

function chartToTable(spec: ChartSpec): { head: string[]; body: string[][] } {
  const head = ["Category", ...spec.series.map((s) => s.name)];
  const body = spec.categories.map((cat, i) => [
    cat,
    ...spec.series.map((s) =>
      s.values[i] === undefined || s.values[i] === null
        ? ""
        : String(s.values[i]),
    ),
  ]);
  return { head, body };
}

/** Generate and download a PDF for a single assistant message. */
export function exportMessageToPdf(content: string, meta: ReportPdfMeta = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;

  const title =
    sanitizeForPdf(meta.title ?? "Robin Report") || "Robin Report";
  const brand = sanitizeForPdf(meta.brand ?? "Ambeon Console") || "Ambeon Console";
  const generatedAt = meta.generatedAt ?? new Date();
  const accent = meta.accentColor ?? EMERALD;

  let y = MARGIN;

  const ensureSpace = (space: number) => {
    if (y + space > pageH - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  /* ── Header band: avatar + title (left) and the brand logos (right) all sit
   * on a SINGLE line, vertically centred against each other. ─────────────── */
  const avatarD = 44;
  const hasAvatar = !!meta.avatarDataUrl;

  // 1) Measure the brand logos (Sherwood left, Ambeon right) before drawing.
  const LOGO_MAX_H = 26;
  const LOGO_MAX_W = 120;
  const LOGO_GAP = 14;
  const headerLogos = (meta.headerLogoDataUrls ?? []).filter(Boolean);
  const logoBoxes: { dataUrl: string; w: number; h: number; fmt: "PNG" | "JPEG" }[] = [];
  for (const dataUrl of headerLogos) {
    try {
      const props = doc.getImageProperties(dataUrl);
      const scale = Math.min(LOGO_MAX_W / props.width, LOGO_MAX_H / props.height);
      logoBoxes.push({
        dataUrl,
        w: props.width * scale,
        h: props.height * scale,
        fmt: dataUrl.includes("image/jpeg") ? "JPEG" : "PNG",
      });
    } catch {
      /* ignore a bad logo */
    }
  }
  const logosTotalW =
    logoBoxes.reduce((s, b) => s + b.w, 0) + Math.max(0, logoBoxes.length - 1) * LOGO_GAP;
  const logosMaxH = logoBoxes.reduce((m, b) => Math.max(m, b.h), 0);

  // 2) Measure the title; shrink the font (down to 13pt) so it stays on a single
  //    line beside the logos instead of wrapping under them.
  const titleX = hasAvatar ? MARGIN + avatarD + 12 : MARGIN;
  const titleRightLimit = pageW - MARGIN - (logosTotalW > 0 ? logosTotalW + 18 : 0);
  const titleW = Math.max(120, titleRightLimit - titleX);
  doc.setFont("helvetica", "bold");
  let titleFont = 18;
  doc.setFontSize(titleFont);
  while (titleFont > 13 && doc.getTextWidth(title) > titleW) {
    titleFont -= 0.5;
    doc.setFontSize(titleFont);
  }
  const titleLines = doc.splitTextToSize(title, titleW);
  const titleLineH = titleFont * 1.25;
  const titleBlockH = (titleLines.length - 1) * titleLineH + titleFont;

  // 3) Band height = tallest element; centre everything within it.
  const bandH = Math.max(logosMaxH, hasAvatar ? avatarD : 0, titleBlockH);
  ensureSpace(bandH);
  const bandTop = y;
  const bandCenter = bandTop + bandH / 2;

  // Logos, drawn right→left and vertically centred.
  let rightX = pageW - MARGIN;
  for (let i = logoBoxes.length - 1; i >= 0; i -= 1) {
    const b = logoBoxes[i];
    const lx = rightX - b.w;
    try {
      doc.addImage(b.dataUrl, b.fmt, lx, bandCenter - b.h / 2, b.w, b.h, undefined, "FAST");
    } catch {
      /* ignore a bad logo and continue */
    }
    rightX = lx - LOGO_GAP;
  }

  // Avatar, vertically centred on the same line.
  if (hasAvatar && meta.avatarDataUrl) {
    try {
      const r = avatarD / 2;
      addCircularImage(doc, meta.avatarDataUrl, MARGIN + r, bandCenter, r, accent);
    } catch {
      /* ignore a bad avatar and continue without it */
    }
  }

  // Title, vertically centred on the same line.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleFont);
  doc.setTextColor(20, 20, 20);
  let titleBaseline = bandCenter - titleBlockH / 2 + titleFont * 0.72;
  for (const line of titleLines) {
    doc.text(line, titleX, titleBaseline);
    titleBaseline += titleLineH;
  }

  y = bandTop + bandH + 12;

  /* Optional centered company logo (legacy; only drawn if a caller passes it). */
  if (meta.logoDataUrl) {
    try {
      const fmt = meta.logoDataUrl.includes("image/jpeg") ? "JPEG" : "PNG";
      const logoW = 110;
      const logoH = 64;
      const logoX = (pageW - logoW) / 2;
      doc.addImage(meta.logoDataUrl, fmt, logoX, y, logoW, logoH, undefined, "FAST");
      y += logoH + 8;
    } catch {
      /* ignore a bad logo and continue without it */
    }
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  const metaBits = [
    meta.author ? `Prepared for ${meta.author}` : null,
    `Generated by ${brand} · ${generatedAt.toLocaleString()}`,
  ].filter(Boolean) as string[];
  for (const bit of metaBits) {
    ensureSpace(13);
    doc.text(bit, MARGIN, y);
    y += 13;
  }

  // Divider
  y += 4;
  ensureSpace(10);
  doc.setDrawColor(...accent);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, y, pageW - MARGIN, y);
  y += 16;

  /* Body */
  const segments = parseSegments(content);

  const addParagraph = (raw: string) => {
    const clean = stripInline(raw);
    const isBullet = /^\s*([-*•])\s+/.test(clean);
    const isHeading = /^\s*#{1,6}\s+/.test(raw);

    if (isHeading) {
      const text = raw.replace(/^\s*#{1,6}\s+/, "");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(20, 20, 20);
      const lines = doc.splitTextToSize(stripInline(text), contentW);
      for (const line of lines) {
        ensureSpace(LINE_HEIGHT + 4);
        doc.text(line, MARGIN, y);
        y += LINE_HEIGHT + 2;
      }
      y += 2;
      return;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(35, 35, 35);

    const prefix = isBullet ? "•  " : "";
    const body = isBullet ? clean.replace(/^\s*([-*•])\s+/, "") : clean;
    const indent = isBullet ? 14 : 0;
    const lines = doc.splitTextToSize(body, contentW - indent);
    lines.forEach((line: string, idx: number) => {
      ensureSpace(LINE_HEIGHT);
      if (idx === 0 && prefix) doc.text(prefix, MARGIN, y);
      doc.text(line, MARGIN + indent, y);
      y += LINE_HEIGHT;
    });
  };

  const addTable = (head: string[], body: string[][], caption?: string) => {
    if (caption) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(20, 20, 20);
      ensureSpace(LINE_HEIGHT);
      doc.text(stripInline(caption), MARGIN, y);
      y += LINE_HEIGHT;
    }
    autoTable(doc, {
      head: [head.map(sanitizeForPdf)],
      body: body.map((row) => row.map(sanitizeForPdf)),
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: EMERALD, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 246] },
      theme: "grid",
    });
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } })
      .lastAutoTable?.finalY;
    y = (finalY ?? y) + 14;
  };

  for (const seg of segments) {
    if (seg.kind === "text") {
      const blocks = seg.text.split("\n");
      for (const block of blocks) {
        if (block.trim() === "") {
          y += 6;
          continue;
        }
        addParagraph(block);
      }
      y += 6;
    } else if (seg.kind === "table") {
      addTable(seg.headers, seg.rows);
    } else if (seg.kind === "chart") {
      const { head, body } = chartToTable(seg.spec);
      const caption = seg.spec.title
        ? seg.spec.unit
          ? `${seg.spec.title} (${seg.spec.unit})`
          : seg.spec.title
        : "Chart data";
      addTable(head, body, caption);
    }
  }

  /* Footer page numbers + colored left spine on every page */
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    drawLeftBar(doc, pageH);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      `Page ${p} of ${pageCount}`,
      pageW - MARGIN,
      pageH - 20,
      { align: "right" },
    );
  }

  const safeName = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  doc.save(`${safeName || "robin-report"}.pdf`);
}
