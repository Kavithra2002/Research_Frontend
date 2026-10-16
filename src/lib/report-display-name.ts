/** Friendly labels for CSE CDN report filenames on the Reports page. */

export type ReportNameMeta = {
  year?: number | null;
  quarter?: number | null;
  label?: string | null;
};

const MONTH_NAME_TO_NUM: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function plausibleYear(year: number): boolean {
  const now = new Date().getFullYear();
  return year >= 1990 && year <= now + 1;
}

function quarterFromMonth(month: number): number {
  if (month >= 1 && month <= 3) return 1;
  if (month >= 4 && month <= 6) return 2;
  if (month >= 7 && month <= 9) return 3;
  return 4;
}

function isAnnualType(reportType: string): boolean {
  return /annual/i.test(reportType);
}

/** Parse year/quarter hints embedded in CSE CDN basenames. */
export function parseReportPeriodFromFileName(fileName: string): {
  year: number | null;
  quarter: number | null;
} {
  const base = fileName.replace(/\.pdf$/i, "");

  // e.g. 643_1464256279305.03.2016 or ...09.2021- QFS
  // Month/year sit after the CDN timestamp digits, so do not require a
  // non-digit boundary before the month.
  const dotted = base.match(/\.(\d{2})\.((?:19|20)\d{2})(?:[^\d]|$)/);
  if (dotted) {
    const month = Number(dotted[1]);
    const year = Number(dotted[2]);
    if (month >= 1 && month <= 12 && plausibleYear(year)) {
      return { year, quarter: quarterFromMonth(month) };
    }
  }

  // e.g. Q1 2024 / 2024 Q3 / QFS
  const qToken = base.match(/\bQ\s*([1-4])\b/i);
  const yearNearQ = base.match(/(?<!\d)((?:19|20)\d{2})(?!\d)/);
  if (qToken && yearNearQ && plausibleYear(Number(yearNearQ[1]))) {
    return { year: Number(yearNearQ[1]), quarter: Number(qToken[1]) };
  }

  // e.g. 31st March 2022
  const named = base.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+((?:19|20)\d{2})/i,
  );
  if (named) {
    const month = MONTH_NAME_TO_NUM[named[2].toLowerCase()];
    const year = Number(named[3]);
    if (month && plausibleYear(year)) {
      return { year, quarter: quarterFromMonth(month) };
    }
  }

  // Trailing _YYYY (older get_report layout: 643_2024.pdf)
  const idYear = base.match(/_((?:19|20)\d{2})$/);
  if (idYear && plausibleYear(Number(idYear[1]))) {
    return { year: Number(idYear[1]), quarter: null };
  }

  // Demo_Data group folders: "Annual Report 2025", "Quarterly Report 2016 Q1"
  const years = [...base.matchAll(/(?<!\d)((?:19|20)\d{2})(?!\d)/g)].map((m) =>
    Number(m[1]),
  );
  const lastYear = years.filter(plausibleYear).at(-1);
  if (lastYear != null) {
    const qOnly = base.match(/\bQ\s*([1-4])\b/i);
    return {
      year: lastYear,
      quarter: qOnly ? Number(qOnly[1]) : null,
    };
  }

  return { year: null, quarter: null };
}

function isGenericReportLabel(label: string): boolean {
  return /^(annual|quarterly)\s+reports?$/i.test(label.trim());
}

export function formatReportDisplayName(
  fileName: string,
  reportType: string,
  meta?: ReportNameMeta | null,
): string {
  const parsed = parseReportPeriodFromFileName(fileName);
  const year = meta?.year ?? parsed.year;
  const quarter = meta?.quarter ?? parsed.quarter;
  const annual = isAnnualType(reportType);

  const trimmed = meta?.label?.trim();
  // Prefer an explicit label only when it already names the period
  // (e.g. "Annual report 2025"), not a bare "Annual report".
  if (trimmed && !isGenericReportLabel(trimmed)) return trimmed;

  if (annual) {
    return year != null ? `Annual report ${year}` : "Annual report";
  }

  if (quarter != null && year != null) {
    return `Quarter ${String(quarter).padStart(2, "0")} - ${year}`;
  }
  if (year != null) {
    return `Quarterly report ${year}`;
  }
  return "Quarterly report";
}

/** Sort key: newest year/quarter first; unknown periods last. */
export function reportSortKey(
  fileName: string,
  reportType: string,
  meta?: ReportNameMeta | null,
): number {
  const parsed = parseReportPeriodFromFileName(fileName);
  const year = meta?.year ?? parsed.year ?? 0;
  const quarter = meta?.quarter ?? parsed.quarter ?? (isAnnualType(reportType) ? 0 : 0);
  return year * 10 + (quarter ?? 0);
}
