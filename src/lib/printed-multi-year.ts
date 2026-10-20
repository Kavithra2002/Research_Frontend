export type PrintedRow = {
  cells: string[];
  note_ref?: string | null;
  style?: string;
};

export type PrintedTable = {
  key?: string;
  title?: string;
  unit?: string;
  pages?: number[];
  header_rows?: string[][];
  rows?: PrintedRow[];
  note_column?: number | null;
  /** Every column that holds a note number. One per year. */
  note_columns?: number[];
  /** Year for each entry in note_columns, same order. */
  note_years?: number[];
  /** Printed note number for this line in each extracted year. */
  source_notes?: { year: number; ref: string }[];
  /** Body/header column indexes where a new year starts. */
  year_breaks?: number[];
  ok?: boolean;
  note_ref?: string;
};

export type PrintedPack = {
  company_slug: string;
  company_name?: string;
  year: number;
  unit?: string;
  statements?: PrintedTable[];
  notes?: Record<string, PrintedTable>;
};

type Slot = {
  entity: string;
  kind: "year" | "change";
  year: number | null;
};

type HeaderModel = {
  prefix: number;
  slots: Slot[];
};

export type MergedPrintedStatement = {
  table: PrintedTable;
  notes: Record<string, PrintedTable>;
  years: number[];
  entities: string[];
  companyName: string;
  unit: string;
};

function yearTokenScore(row: string[] | undefined, nowYear: number): number {
  if (!row?.length) return 0;
  let score = 0;
  for (const cell of row) {
    const label = String(cell ?? "").trim();
    if (!/^20\d{2}$/.test(label)) continue;
    const year = Number(label);
    if (year >= 1990 && year <= nowYear + 1) score += 1;
  }
  return score;
}

function entityTokenScore(row: string[] | undefined): number {
  if (!row?.length) return 0;
  let score = 0;
  for (const cell of row) {
    const who = String(cell ?? "").trim();
    if (/^(group|company|bank|parent)$/i.test(who)) score += 2;
    else if (who && !/^20\d{2}$/.test(who) && !/^lkr$/i.test(who) && !/^note$/i.test(who)) {
      score += 1;
    }
  }
  return score;
}

/**
 * Pick the header row that carries year labels (2024, 2025, …).
 * OpenAI / printed extracts often put years in a middle row and currency
 * (LKR) on the last row — using the last row alone drops every amount.
 */
function pickYearHeaderRow(headerRows: string[][], nowYear: number): string[] {
  let best: string[] = headerRows[headerRows.length - 1] ?? [];
  let bestScore = -1;
  for (const row of headerRows) {
    const score = yearTokenScore(row, nowYear);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

/** Prefer Group/Company/Bank row (usually above the year row). */
function pickEntityHeaderRow(headerRows: string[][], yearRow: string[]): string[] {
  let best: string[] = headerRows[0] ?? [];
  let bestScore = -1;
  for (const row of headerRows) {
    if (row === yearRow) continue;
    // Skip pure currency / unit rows.
    if (row.every((c) => !String(c ?? "").trim() || /^lkr$/i.test(String(c).trim()))) {
      continue;
    }
    const score = entityTokenScore(row);
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

function headerModel(headerRows: string[][]): HeaderModel {
  const nowYear = new Date().getFullYear();
  const bottom = pickYearHeaderRow(headerRows, nowYear);
  const top = pickEntityHeaderRow(headerRows, bottom);
  const width = Math.max(top.length, bottom.length);
  let entity = "";
  const slots: Slot[] = [];
  let prefix = 0;
  let seen = false;
  for (let i = 0; i < width; i++) {
    const who = String(top[i] ?? "").trim();
    // Don't treat "Note" / currency as an entity name for amount columns.
    if (who && !/^note$/i.test(who) && !/^lkr$/i.test(who) && !/^20\d{2}$/.test(who)) {
      entity = who;
    }
    const label = String(bottom[i] ?? "").trim();
    if (/^20\d{2}$/.test(label)) {
      const year = Number(label);
      // Ignore timestamp-fragment years (e.g. 2096) so they never become columns.
      if (year < 1990 || year > nowYear + 1) {
        if (!seen) prefix = i + 1;
        continue;
      }
      seen = true;
      slots.push({ entity: entity || "Value", kind: "year", year });
    } else if (/change/i.test(label)) {
      seen = true;
      slots.push({ entity: entity || "Value", kind: "change", year: null });
    } else if (!seen) {
      prefix = i + 1;
    }
  }
  return { prefix, slots };
}

function spacerIndexes(rows: PrintedRow[], prefix: number): Set<number> {
  const matrix = rows
    .filter((row) => (row.style ?? "").toLowerCase() !== "section")
    .map((row) =>
      (row.cells ?? []).slice(prefix).map((cell) => String(cell ?? "").trim()),
    );
  const width = Math.max(0, ...matrix.map((row) => row.length));
  const filledRows = matrix.filter((row) => row.some(Boolean));
  const spacers = new Set<number>();
  for (let i = 0; i < width; i++) {
    const filled = filledRows.filter((row) => row[i]).length;
    if (filledRows.length > 0 && filled / filledRows.length < 0.2) spacers.add(i);
  }
  return spacers;
}

function readSlotValues(amounts: string[], model: HeaderModel, spacers: Set<number>): string[] {
  const slotCount = model.slots.length;
  const nonempty = amounts.filter(Boolean);
  if (slotCount > 0 && nonempty.length === slotCount) return nonempty;

  const entityCount = new Set(model.slots.map((slot) => slot.entity)).size;
  const pairedColumns =
    entityCount > 0 &&
    amounts.length === entityCount * 4 &&
    slotCount === entityCount * 3 &&
    model.slots.every((slot, index) =>
      index % 3 === 2 ? slot.kind === "change" : slot.kind === "year",
    );
  if (pairedColumns) {
    const out: string[] = [];
    for (let entity = 0; entity < entityCount; entity++) {
      const base = entity * 4;
      out.push(
        amounts[base] || amounts[base + 1] || "",
        amounts[base + 2] || "",
        amounts[base + 3] || "",
      );
    }
    return out;
  }

  const kept = amounts.filter((_, index) => !spacers.has(index));
  if (kept.length === slotCount) return kept;
  if (amounts.length === slotCount) return amounts;
  return kept.concat(Array(slotCount).fill("")).slice(0, slotCount);
}

function normalizeLabel(label: string): string {
  let text = label.toLowerCase();
  text = text.replace(/\([^)]*\)/g, " ");
  text = text.replace(/\bvalue added tax\b/g, "tax");
  text = text.replace(/\bprofits\b/g, "profit");
  text = text.replace(/\btaxes\b/g, "tax");
  text = text.replace(/[^a-z0-9]+/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

/** True when cell[0] is a shifted amount — never use as the description column. */
function labelLooksLikeAmount(label: string): boolean {
  const text = String(label ?? "").trim();
  if (!text) return true;
  if (/[A-Za-z]{2,}/.test(text)) return false;
  if (/^\(?-?\d{1,3}(?:,\d{3})+(?:\.\d+)?\)?%?$/.test(text)) return true;
  if (/^\(?-?\d{4,}(?:\.\d+)?\)?%?$/.test(text)) return true;
  if (/^[\-–—]$/.test(text)) return true;
  if (/^\d+\.\d{1,4}$/.test(text)) return true;
  return false;
}

function isBetterLabel(candidate: string, current: string): boolean {
  const candBad = labelLooksLikeAmount(candidate);
  const curBad = labelLooksLikeAmount(current);
  if (!candBad && curBad) return true;
  if (candBad) return false;
  if (!current.trim()) return Boolean(candidate.trim());
  return candidate.trim().length > current.trim().length;
}

type RowFact = {
  label: string;
  style: string;
  note: string;
  page: string;
  noteRef: string | null;
  /** Note number printed on this line in each report year. */
  notesByYear: Map<number, string>;
  amounts: Map<string, string>;
  changes: Map<string, string>;
};

function noteToken(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  return /^\d+(?:\.\d+)?$/.test(text) ? text : "";
}

function factKey(entity: string, year: number): string {
  return `${entity}|${year}`;
}

function resolveBodyPrefix(
  model: HeaderModel,
  rows: PrintedRow[],
): number {
  let prefix = model.prefix;
  // Header claims a Note column but body put the first amount at index 1 —
  // common for note tables (Group/Company × current+prior with no note col).
  // Never treat blank cells or note refs (e.g. "5") as amounts — that drops
  // the Note column when switching Group → Company.
  if (prefix >= 2) {
    const sample = rows
      .map((row) => (row.cells ?? []).map((cell) => String(cell ?? "").trim()))
      .filter((cells) => cells[0] && !labelLooksLikeAmount(cells[0]))
      .slice(0, 12);
    if (sample.length >= 3) {
      const amountAt1 = sample.filter((cells) => {
        const cell = cells[1] ?? "";
        if (!cell) return false;
        if (noteToken(cell)) return false;
        return labelLooksLikeAmount(cell);
      }).length;
      if (amountAt1 >= Math.ceil(sample.length * 0.5)) {
        prefix = 1;
      }
    }
  }
  return prefix;
}

function yearsFromTable(table: PrintedTable, fallback: number): number[] {
  const model = headerModel(table.header_rows ?? []);
  const years = [
    ...new Set(
      model.slots
        .filter((slot) => slot.kind === "year" && slot.year != null)
        .map((slot) => slot.year as number),
    ),
  ].sort((a, b) => b - a);
  if (years.length > 0) return years;
  return [fallback, fallback - 1].filter((y) => y >= 1990);
}

type IngestMode = {
  /**
   * false (default): only keep this report's *current* year amounts for the
   * multi-year statement grid — comparative prior-year columns must not fill
   * another year's real column (2025 report's "2024" ≠ 2024 report data).
   *
   * true: keep every printed year column (for note popups that show current
   * + last year together as in the PDF).
   */
  includeComparativeYears?: boolean;
};

function ingestReport(
  table: PrintedTable,
  reportYear: number,
  mode: IngestMode = {},
): Map<string, RowFact> {
  const includeComparative = Boolean(mode.includeComparativeYears);
  const model = headerModel(table.header_rows ?? []);
  const rows = table.rows ?? [];
  const prefix = resolveBodyPrefix(model, rows);
  const spacers = spacerIndexes(rows, prefix);
  const seen = new Map<string, number>();
  const facts = new Map<string, RowFact>();
  if (model.slots.length === 0) return facts;

  for (const row of rows) {
    const cells = (row.cells ?? []).map((cell) => String(cell ?? "").trim());
    const label = cells[0] ?? "";
    // Bad extracts (e.g. 2018) put amounts in column 0 — never treat as a line key.
    if (labelLooksLikeAmount(label)) continue;
    // Skip echoed Group/Company/year header lines inside the body.
    if (/^(group|company|bank)$/i.test(label)) {
      const rest = cells.slice(1);
      if (!rest.some((cell) => labelLooksLikeAmount(cell))) continue;
    }
    if (
      !label &&
      cells.slice(1).every((cell) => !cell || /^20\d{2}$/.test(cell))
    ) {
      continue;
    }
    const base = normalizeLabel(label);
    if (!base) continue;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const key = `${base}#${occurrence}`;
    const amounts = cells.slice(prefix);
    const values = readSlotValues(amounts, model, spacers);
    const printedNote =
      noteToken(prefix > 1 ? cells[1] : "") || noteToken(row.note_ref);
    const fact: RowFact = facts.get(key) ?? {
      label,
      style: (row.style ?? "data").toLowerCase(),
      note: printedNote,
      page: prefix > 2 ? cells[2] ?? "" : "",
      noteRef: row.note_ref ?? null,
      notesByYear: new Map<number, string>(),
      amounts: new Map(),
      changes: new Map(),
    };
    if (isBetterLabel(label, fact.label)) fact.label = label;
    if (printedNote) fact.notesByYear.set(reportYear, printedNote);
    model.slots.forEach((slot, index) => {
      const value = values[index] ?? "";
      if (!value) return;
      // Never park a bare note ref in a year amount column.
      if (
        slot.kind === "year" &&
        /^\d{1,2}(?:\.\d{1,2})?$/.test(value) &&
        !/\d{1,3}(?:,\d{3})+/.test(value)
      ) {
        if (!printedNote) {
          fact.notesByYear.set(reportYear, value);
          fact.note = fact.note || value;
        }
        return;
      }
      if (slot.kind === "year" && slot.year != null) {
        // Statement multi-year: only this report's current year.
        // Note popup: keep printed current + prior year columns.
        if (!includeComparative && slot.year !== reportYear) return;
        fact.amounts.set(factKey(slot.entity, slot.year), value);
      } else if (slot.kind === "change") {
        fact.changes.set(factKey(slot.entity, reportYear), value);
      }
    });
    if (!fact.note && prefix > 1 && cells[1]) fact.note = cells[1];
    if (!fact.page && prefix > 2 && cells[2]) fact.page = cells[2];
    if (!fact.noteRef && row.note_ref) fact.noteRef = row.note_ref;
    facts.set(key, fact);
  }
  return facts;
}

function isYearGrid(table: PrintedTable): boolean {
  const rows = table.header_rows ?? [];
  if (rows.length === 0) return false;
  const model = headerModel(rows);
  if (model.slots.length < 1 || model.prefix > 4) return false;
  const topLabels = (rows[0] ?? []).map((cell) => cell.trim()).filter(Boolean);
  if (rows.length > 1 && topLabels.some((label) => label.length > 24)) return false;
  // Use the year-bearing row (not always the last — may be LKR / units).
  const nowYear = new Date().getFullYear();
  const bottom = pickYearHeaderRow(rows, nowYear);
  return bottom.every((cell) => {
    const text = cell.trim();
    return (
      !text ||
      /^20\d{2}$/.test(text) ||
      /change/i.test(text) ||
      /^(note|page|rs\.?|lkr)\b/i.test(text)
    );
  });
}

function numericCells(table: PrintedTable): number {
  let count = 0;
  for (const row of table.rows ?? []) {
    for (const cell of row.cells ?? []) {
      if (/\d{1,3}(?:,\d{3})+|\(\d[\d,]*\)/.test(String(cell))) count += 1;
    }
  }
  return count;
}

function inRange(year: number, fromYear: number | null, toYear: number | null): boolean {
  if (fromYear != null && year < fromYear) return false;
  if (toYear != null && year > toYear) return false;
  return true;
}

function entitiesForPanel(entities: string[], panel: "group" | "company"): string[] {
  const group = entities.filter((name) => /^group$/i.test(name));
  const company = entities.filter((name) => !/^group$/i.test(name));
  if (panel === "group") return group.length > 0 ? group : entities.slice(0, 1);
  return company.length > 0 ? company : entities.slice(-1);
}

type YearTable = { year: number; table?: PrintedTable };

type SeriesMerge = {
  table: PrintedTable;
  facts: Map<string, RowFact>;
  order: string[];
  years: number[];
};

function mergeTableSeries(
  series: YearTable[],
  panel: "group" | "company",
  entities: string[],
  displayYears?: number[],
  mode: IngestMode = {},
): SeriesMerge | null {
  const includeComparative = Boolean(mode.includeComparativeYears);
  const present = series.filter((item) => item.table);
  if (present.length === 0) return null;
  const newest = present[present.length - 1]!;

  const perReport = series.map((item) => ({
    year: item.year,
    facts: item.table
      ? ingestReport(item.table, item.year, mode)
      : new Map<string, RowFact>(),
  }));
  if (!perReport.some((item) => item.facts.size > 0)) return null;

  const merged = new Map<string, RowFact>();
  for (const report of perReport) {
    for (const [key, fact] of report.facts) {
      const target = merged.get(key);
      if (!target) {
        merged.set(key, {
          label: fact.label,
          style: fact.style,
          note: fact.note,
          page: fact.page,
          noteRef: fact.noteRef,
          notesByYear: new Map(fact.notesByYear),
          amounts: new Map(fact.amounts),
          changes: new Map(fact.changes),
        });
        continue;
      }
      if (fact.label && isBetterLabel(fact.label, target.label)) {
        target.label = fact.label;
      }
      if (fact.style && fact.style !== "data") target.style = fact.style;
      if (fact.note) target.note = fact.note;
      if (fact.page) target.page = fact.page;
      if (fact.noteRef) target.noteRef = fact.noteRef;
      for (const [year, note] of fact.notesByYear) {
        // Note refs belong to the report year that printed them.
        if (year === report.year) {
          target.notesByYear.set(year, note);
        }
      }
      for (const [id, value] of fact.amounts) {
        const year = Number(id.split("|")[1]);
        if (includeComparative) {
          // Note popup: keep every printed year from this single report.
          target.amounts.set(id, value);
        } else if (year === report.year) {
          // Multi-year statement: each report only owns its current year.
          target.amounts.set(id, value);
        }
      }
      for (const [id, value] of fact.changes) target.changes.set(id, value);
    }
  }

  const order: string[] = [];
  const seenOrder = new Set<string>();
  const newestFacts = perReport[perReport.length - 1]?.facts;
  for (const key of newestFacts?.keys() ?? []) {
    order.push(key);
    seenOrder.add(key);
  }
  for (const report of perReport) {
    for (const key of report.facts.keys()) {
      if (seenOrder.has(key)) continue;
      seenOrder.add(key);
      order.push(key);
    }
  }

  const knownEntities = [...entities];
  const newestModel = headerModel(newest.table?.header_rows ?? []);
  for (const slot of newestModel.slots) {
    if (!knownEntities.includes(slot.entity)) knownEntities.push(slot.entity);
  }
  for (const fact of merged.values()) {
    for (const id of fact.amounts.keys()) {
      const entity = id.split("|")[0] ?? "";
      if (entity && !knownEntities.includes(entity)) knownEntities.push(entity);
    }
  }

  const shownEntities = entitiesForPanel(knownEntities, panel);
  // Newest years first — sit immediately right of the description column.
  const years = [...new Set(displayYears ?? series.map((item) => item.year))].sort(
    (a, b) => b - a,
  );

  const columns: { entity: string; year: number }[] = [];
  const yearBreaks: number[] = [];
  const noteColumns: number[] = [];
  let columnIndex = 1;
  for (const entity of shownEntities) {
    let firstYear = true;
    for (const year of years) {
      if (!firstYear) yearBreaks.push(columnIndex);
      firstYear = false;
      noteColumns.push(columnIndex);
      columns.push({ entity, year });
      columnIndex += 2;
    }
  }

  const entityHeader = [""];
  const yearHeader = [""];
  for (const column of columns) {
    entityHeader.push(column.entity, "");
    yearHeader.push("Note", String(column.year));
  }

  // Drop any residual amount-as-label rows that slipped through older packs.
  const body: PrintedRow[] = order
    .map((key) => {
      const fact = merged.get(key)!;
      if (labelLooksLikeAmount(fact.label)) return null;
      const cells = [fact.label];
      for (const column of columns) {
        cells.push(fact.notesByYear.get(column.year) ?? "");
        cells.push(fact.amounts.get(factKey(column.entity, column.year)) ?? "");
      }
      return {
        cells,
        note_ref: key,
        style: fact.style,
      } satisfies PrintedRow;
    })
    .filter((row): row is PrintedRow => row != null);

  const pages = [
    ...new Set(present.flatMap((item) => item.table?.pages ?? [])),
  ].sort((a, b) => a - b);

  return {
    table: {
      key: newest.table?.key,
      title: newest.table?.title,
      unit: newest.table?.unit || "",
      pages,
      header_rows: [entityHeader, yearHeader],
      rows: body,
      note_column: noteColumns[0] ?? null,
      note_columns: noteColumns,
      note_years: columns.map((column) => column.year),
      year_breaks: yearBreaks,
      ok: body.some((row) => row.cells.some((cell, index) => index > 0 && cell)),
    },
    facts: merged,
    order,
    years,
  };
}

function collectEntities(reports: PrintedPack[], statementKey: string): string[] {
  const entities: string[] = [];
  for (const report of [...reports].reverse()) {
    const table = report.statements?.find((item) => item.key === statementKey);
    for (const slot of headerModel(table?.header_rows ?? []).slots) {
      if (!entities.includes(slot.entity)) entities.push(slot.entity);
    }
  }
  return entities;
}

/**
 * DB layout for Group and Company (same shape):
 *
 *                    |  2025
 * Description | Note | value
 */
function etFaithfulTable(
  table: PrintedTable,
  panel: "group" | "company",
  reportYear: number,
): PrintedTable {
  const headerRows = (table.header_rows ?? []).map((row) =>
    row.map((cell) => String(cell ?? "")),
  );
  const rows = table.rows ?? [];
  if (headerRows.length === 0) return table;

  const model = headerModel(headerRows);
  const prefix = Math.max(model.prefix, table.note_column != null ? 2 : model.prefix);
  const hasNote = prefix >= 2 || table.note_column === 1;

  const entitySlots = model.slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => {
      const isGroup = /^group$/i.test(slot.entity);
      return panel === "group" ? isGroup : !isGroup;
    });

  // Prefer this report's year for the selected entity; else newest year slot.
  let chosen =
    entitySlots.find(
      ({ slot }) => slot.kind === "year" && slot.year === reportYear,
    ) ?? null;
  if (!chosen) {
    const yearSlots = entitySlots
      .filter(({ slot }) => slot.kind === "year" && slot.year != null)
      .sort((a, b) => (b.slot.year ?? 0) - (a.slot.year ?? 0));
    chosen = yearSlots[0] ?? null;
  }

  const entityName =
    chosen?.slot.entity ||
    (panel === "group" ? "Group" : "Company");
  const yearLabel = chosen?.slot.year ?? reportYear;
  const amountCol =
    chosen != null ? prefix + chosen.index : prefix;

  // Unit from original LKR row when present.
  const unitRow = headerRows.find((row) =>
    row.some((cell) => /^lkr$/i.test(String(cell).trim())),
  );
  const unitText =
    (unitRow && (unitRow[amountCol] || unitRow.find((c) => /^lkr$/i.test(c)))) ||
    table.unit ||
    "LKR";

  const nextHeaders: string[][] = hasNote
    ? [
        ["", "Note", entityName],
        ["", "", String(yearLabel)],
        ["", "", String(unitText)],
      ]
    : [
        ["", entityName],
        ["", String(yearLabel)],
        ["", String(unitText)],
      ];

  const nextRows: PrintedRow[] = rows.map((row) => {
    const cells = (row.cells ?? []).map((cell) => String(cell ?? ""));
    const label = cells[0] ?? "";
    const note =
      noteToken(hasNote ? cells[1] ?? "" : "") ||
      noteToken(row.note_ref) ||
      "";
    const amount = cells[amountCol] ?? "";
    return {
      ...row,
      cells: hasNote ? [label, note, amount] : [label, amount],
      note_ref: note || null,
    };
  });

  return {
    ...table,
    header_rows: nextHeaders,
    rows: nextRows,
    note_column: hasNote ? 1 : null,
    note_columns: hasNote ? [1] : undefined,
    note_years: hasNote ? [yearLabel] : undefined,
    year_breaks: undefined,
  };
}

function wireEtNotes(
  table: PrintedTable,
  pack: PrintedPack,
): Record<string, PrintedTable> {
  const notes: Record<string, PrintedTable> = {};
  const year = pack.year;
  const rawNotes = pack.notes ?? {};
  for (const row of table.rows ?? []) {
    const ref =
      noteToken(row.note_ref) ||
      (table.note_column != null
        ? noteToken(row.cells?.[table.note_column] ?? "")
        : "");
    if (!ref) {
      row.note_ref = null;
      continue;
    }
    const raw = rawNotes[ref];
    if (!raw || !(raw.rows?.length)) {
      // Still mark clickable; dialog can fall back.
      row.note_ref = `${year}|${ref}`;
      continue;
    }
    const key = `${year}|${ref}`;
    notes[key] = {
      ...raw,
      title: raw.title || `Note ${ref}`,
      source_notes: [{ year, ref }],
    };
    row.note_ref = key;
  }
  return notes;
}

export function mergePrintedStatements(
  reports: PrintedPack[],
  statementKey: string,
  fromYear: number | null = null,
  toYear: number | null = null,
  panel: "group" | "company" = "group",
): MergedPrintedStatement | null {
  const ranged = reports
    .filter((report) => Number.isFinite(report.year))
    .filter((report) => inRange(report.year, fromYear, toYear))
    .sort((a, b) => a.year - b.year);
  if (ranged.length === 0) return null;

  // Same table as Extracted Tables for the newest year in range — avoids the
  // multi-year remesh that broke labels/amounts. Notes stay clickable.
  const focus =
    toYear != null
      ? [...ranged].reverse().find((report) => report.year === toYear) ??
        ranged[ranged.length - 1]
      : ranged[ranged.length - 1];
  const raw = focus.statements?.find((item) => item.key === statementKey);
  if (!raw || (!(raw.rows?.length) && raw.ok === false)) return null;

  const table = etFaithfulTable(raw, panel, focus.year);
  table.unit = table.unit || focus.unit || "";
  table.title = table.title || raw.title;
  const notes = wireEtNotes(table, focus);
  const entities = collectEntities([focus], statementKey);

  return {
    table,
    notes,
    years: [focus.year],
    entities,
    companyName: focus.company_name || focus.company_slug,
    unit: table.unit || focus.unit || "",
  };
}

function registerLineNotes(
  notes: Record<string, PrintedTable>,
  prefix: string,
  series: SeriesMerge,
  reportsByYear: Map<number, PrintedPack>,
  extractedYears: Set<number>,
  entities: string[],
  panel: "group" | "company",
  depth: number,
): void {
  series.order.forEach((key, index) => {
    const fact = series.facts.get(key);
    const row = series.table.rows?.[index];
    if (!fact || !row) return;
    const lineKey = prefix ? `${prefix}/${key}` : key;
    const sources = [...fact.notesByYear.entries()]
      .filter(([year]) => extractedYears.has(year))
      .sort((a, b) => a[0] - b[0])
      .map(([year, ref]) => ({ year, ref }));
    if (sources.length === 0 || depth > 3) {
      row.note_ref = null;
      return;
    }

    const linkedYears: number[] = [];
    for (const source of sources) {
      const raw = reportsByYear.get(source.year)?.notes?.[source.ref];
      if (!raw || !(raw.rows?.length)) continue;
      const storageKey = `${source.year}|${lineKey}`;
      if (!isYearGrid(raw)) {
        notes[storageKey] = {
          ...raw,
          title: fact.label || raw.title,
          source_notes: [source],
        };
        linkedYears.push(source.year);
        continue;
      }
      // Note popup: show this report's note as printed (current + last year).
      const noteYears = yearsFromTable(raw, source.year);
      const child = mergeTableSeries(
        [{ year: source.year, table: raw }],
        panel,
        entities,
        noteYears,
        { includeComparativeYears: true },
      );
      if (!child || numericCells(child.table) === 0) {
        notes[storageKey] = {
          ...raw,
          title: fact.label || raw.title,
          source_notes: [source],
        };
        linkedYears.push(source.year);
        continue;
      }
      child.table.title = fact.label || child.table.title;
      child.table.source_notes = [source];
      notes[storageKey] = child.table;
      registerLineNotes(
        notes,
        lineKey,
        child,
        reportsByYear,
        new Set([source.year]),
        entities,
        panel,
        depth + 1,
      );
      linkedYears.push(source.year);
    }

    if (linkedYears.length === 0) {
      row.note_ref = null;
      return;
    }
    row.note_ref = depth === 0 ? lineKey : `${linkedYears[0]}|${lineKey}`;
  });
}
