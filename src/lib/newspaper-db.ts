export const COMMERCIAL_BANK_SLUG = "Commercial_Bank_of_Ceylon_PLC";

export type DbViewMode =
  | "fs"
  | "drivers"
  | "ratios"
  | "quarterly"
  | "notes"
  | "test";

export type NoteExtractedTable = {
  caption?: string | null;
  header_rows: string[][];
  rows: {
    cells: string[];
    style?: string | Record<string, unknown>;
  }[];
  extraction_method?: string;
  extraction_model?: string;
};

export type DbGridRow = {
  label: string;
  kind: "section" | "subsection" | "data" | "check" | string;
  values: Record<string, number | null>;
  statuses?: Record<string, string>;
  has_notes?: boolean;
  drivers_row?: number;
  notes?: { label: string; value: number | null; row?: number }[];
  notes_by_year?: Record<
    string,
    { label: string; value: number | null; row?: number }[]
  >;
  note_source_by_year?: Record<
    string,
    {
      note_ref?: string;
      source_pdf?: string | null;
      source_page?: number | null;
      source_pages?: number[];
      capture_files?: string[];
      statement_key?: string;
    }
  >;
  note_tables_by_year?: Record<string, NoteExtractedTable[]>;
  reference_values?: Record<string, number | null>;
};

export type DbFsPreview = {
  view: "fs";
  company_slug: string;
  company_name?: string;
  ticker?: string | null;
  years: number[];
  unit: string;
  period_label: string;
  rows: DbGridRow[];
  cells_filled: number;
  cells_missing: number;
  quarterly_available?: boolean;
  value_format?: "amount" | "ratio";
  template_validation?: {
    matched: number;
    mismatched: number;
    compared: number;
  };
};

export type DbDriversPreview = {
  view: "drivers";
  company_slug: string;
  company_name?: string;
  years: number[];
  unit: string;
  period_label: string;
  rows: DbGridRow[];
  cells_filled: number;
  cells_missing: number;
  template_validation?: {
    matched: number;
    mismatched: number;
    compared: number;
  };
};

export type DbRatiosPreview = {
  view: "ratios";
  company_slug: string;
  company_name?: string;
  years: number[];
  unit: string;
  period_label: string;
  rows: DbGridRow[];
  cells_filled: number;
  cells_missing: number;
  value_format?: "ratio";
  template_validation?: {
    matched: number;
    mismatched: number;
    compared: number;
  };
};

export type DbQuarterlyPreview = {
  view: "quarterly";
  company_slug: string;
  company_name: string;
  unit: string;
  period_label: string;
  columns: { key: string; label: string }[];
  rows: DbGridRow[];
  cells_filled?: number;
  cells_missing?: number;
  years?: number[];
  template_validation?: {
    matched: number;
    mismatched: number;
    compared: number;
  };
};

export type DbNotesPreview = {
  view: "notes";
  company_slug: string;
  company_name?: string;
  years: number[];
  unit: string;
  period_label: string;
  rows: DbGridRow[];
  notes_extracted_years?: number[];
  note_line_items?: number;
  note_line_items_with_data?: number;
};

export type DbPreview =
  | DbFsPreview
  | DbDriversPreview
  | DbRatiosPreview
  | DbQuarterlyPreview
  | DbNotesPreview;

export function isQuarterlyDbAvailable(companySlug: string | null): boolean {
  return companySlug === COMMERCIAL_BANK_SLUG;
}

export function isCombPilotAvailable(companySlug: string | null): boolean {
  return companySlug === COMMERCIAL_BANK_SLUG;
}

export function formatDbAmount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  return value < 0 ? `(${formatted})` : formatted;
}

/** Stored amounts match report figures in Rs. '000 (e.g. 222,393,079). */
export type DbAmountDisplay = "raw" | "mn" | "k";

export function formatDbAmountInK(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const k = value / 1_000;
  const abs = Math.abs(k);
  const formatted = abs.toLocaleString("en-US", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
  const core = `${formatted} K`;
  return k < 0 ? `(${core})` : core;
}

export function formatDbAmountInMn(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const mn = value / 1_000_000;
  const abs = Math.abs(mn);
  const formatted = abs.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  const core = `${formatted} Mn`;
  return mn < 0 ? `(${core})` : core;
}

/** Rows that stay in raw units (per-share, ratio-style driver lines, etc.). */
export function shouldScaleAmountLabel(label: string): boolean {
  const l = label.toLowerCase();
  if (
    l.includes("per share") ||
    l.includes("per employee") ||
    l.includes("per centre") ||
    l.includes("per center") ||
    l.includes("as a %") ||
    l.includes("as a percent")
  ) {
    return false;
  }
  return true;
}

export function formatDbUnitForDisplay(
  unit: string,
  display: DbAmountDisplay,
): string {
  if (display === "raw") return unit;
  const label = display === "mn" ? "LKR Mn" : "LKR K";
  if (unit.toLowerCase().includes("per share")) {
    return `${label} except per share data`;
  }
  return label;
}

export function formatDbRatio(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (Math.abs(value) <= 1.5) {
    return `${(value * 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}%`;
  }
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}

function isDbDataRow(kind: DbGridRow["kind"]): boolean {
  return kind === "data" || kind === "check";
}

/** Filter grid rows by label while keeping section/subsection headers for context. */
export function filterDbGridRows(
  rows: DbGridRow[],
  query: string,
): DbGridRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;

  const labelMatches = (label: string) => label.toLowerCase().includes(q);
  const visible = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    if (isDbDataRow(rows[i].kind) && labelMatches(rows[i].label)) {
      visible.add(i);
      for (let j = i - 1; j >= 0; j--) {
        const kind = rows[j].kind;
        if (kind === "subsection" || kind === "section") {
          visible.add(j);
          if (kind === "section") break;
        }
      }
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind === "section" && labelMatches(row.label)) {
      visible.add(i);
      for (let j = i + 1; j < rows.length && rows[j].kind !== "section"; j++) {
        visible.add(j);
      }
    } else if (row.kind === "subsection" && labelMatches(row.label)) {
      visible.add(i);
      for (
        let j = i + 1;
        j < rows.length &&
        rows[j].kind !== "section" &&
        rows[j].kind !== "subsection";
        j++
      ) {
        visible.add(j);
      }
    }
  }

  return rows.filter((_, i) => visible.has(i));
}
