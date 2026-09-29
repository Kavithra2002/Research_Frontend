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

function headerModel(headerRows: string[][]): HeaderModel {
  const top = headerRows[0] ?? [];
  const bottom = headerRows[headerRows.length - 1] ?? [];
  const width = Math.max(top.length, bottom.length);
  let entity = "";
  const slots: Slot[] = [];
  let prefix = 0;
  let seen = false;
  for (let i = 0; i < width; i++) {
    const who = String(top[i] ?? "").trim();
    if (who) entity = who;
    const label = String(bottom[i] ?? "").trim();
    if (/^20\d{2}$/.test(label)) {
      seen = true;
      slots.push({ entity: entity || "Value", kind: "year", year: Number(label) });
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

function ingestReport(table: PrintedTable, reportYear: number): Map<string, RowFact> {
  const model = headerModel(table.header_rows ?? []);
  const rows = table.rows ?? [];
  const spacers = spacerIndexes(rows, model.prefix);
  const seen = new Map<string, number>();
  const facts = new Map<string, RowFact>();
  if (model.slots.length === 0) return facts;

  for (const row of rows) {
    const cells = (row.cells ?? []).map((cell) => String(cell ?? "").trim());
    const label = cells[0] ?? "";
    const base = normalizeLabel(label);
    if (!base) continue;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const key = `${base}#${occurrence}`;
    const amounts = cells.slice(model.prefix);
    const values = readSlotValues(amounts, model, spacers);
    const printedNote =
      noteToken(model.prefix > 1 ? cells[1] : "") || noteToken(row.note_ref);
    const fact: RowFact = facts.get(key) ?? {
      label,
      style: (row.style ?? "data").toLowerCase(),
      note: printedNote,
      page: model.prefix > 2 ? cells[2] ?? "" : "",
      noteRef: row.note_ref ?? null,
      notesByYear: new Map<number, string>(),
      amounts: new Map(),
      changes: new Map(),
    };
    if (printedNote) fact.notesByYear.set(reportYear, printedNote);
    model.slots.forEach((slot, index) => {
      const value = values[index] ?? "";
      if (!value) return;
      if (slot.kind === "year" && slot.year != null) {
        const id = factKey(slot.entity, slot.year);
        if (slot.year === reportYear || !fact.amounts.has(id)) {
          fact.amounts.set(id, value);
        }
      } else if (slot.kind === "change") {
        fact.changes.set(factKey(slot.entity, reportYear), value);
      }
    });
    if (!fact.note && model.prefix > 1 && cells[1]) fact.note = cells[1];
    if (!fact.page && model.prefix > 2 && cells[2]) fact.page = cells[2];
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
  const bottom = rows[rows.length - 1] ?? [];
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
): SeriesMerge | null {
  const present = series.filter((item) => item.table);
  if (present.length === 0) return null;
  const newest = present[present.length - 1]!;

  const perReport = series.map((item) => ({
    year: item.year,
    facts: item.table ? ingestReport(item.table, item.year) : new Map<string, RowFact>(),
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
      if (fact.label) target.label = fact.label;
      if (fact.style && fact.style !== "data") target.style = fact.style;
      if (fact.note) target.note = fact.note;
      if (fact.page) target.page = fact.page;
      if (fact.noteRef) target.noteRef = fact.noteRef;
      for (const [year, note] of fact.notesByYear) {
        if (year === report.year || !target.notesByYear.has(year)) {
          target.notesByYear.set(year, note);
        }
      }
      for (const [id, value] of fact.amounts) {
        const year = Number(id.split("|")[1]);
        if (year === report.year || !target.amounts.has(id)) target.amounts.set(id, value);
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
  const years = [...new Set(displayYears ?? series.map((item) => item.year))].sort(
    (a, b) => a - b,
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

  const bottom = [""];
  for (const column of columns) {
    bottom.push("Note", String(column.year));
  }
  const body: PrintedRow[] = order.map((key) => {
    const fact = merged.get(key)!;
    const cells = [fact.label];
    for (const column of columns) {
      cells.push(fact.notesByYear.get(column.year) ?? "");
      cells.push(fact.amounts.get(factKey(column.entity, column.year)) ?? "");
    }
    return {
      cells,
      note_ref: key,
      style: fact.style,
    };
  });

  const pages = [
    ...new Set(present.flatMap((item) => item.table?.pages ?? [])),
  ].sort((a, b) => a - b);

  return {
    table: {
      key: newest.table?.key,
      title: newest.table?.title,
      unit: newest.table?.unit || "",
      pages,
      header_rows: [bottom],
      rows: body,
      note_column: noteColumns[0] ?? null,
      note_columns: noteColumns,
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

  const newest = ranged[ranged.length - 1];
  const statement = newest.statements?.find((item) => item.key === statementKey);
  if (!statement) return null;

  const entities = collectEntities(ranged, statementKey);
  const mergedSeries = mergeTableSeries(
    ranged.map((report) => ({
      year: report.year,
      table: report.statements?.find((item) => item.key === statementKey),
    })),
    panel,
    entities,
  );
  if (!mergedSeries) return null;
  mergedSeries.table.unit = mergedSeries.table.unit || newest.unit || "";

  const reportsByYear = new Map(ranged.map((report) => [report.year, report]));
  const extractedYears = new Set(ranged.map((report) => report.year));
  const notes: Record<string, PrintedTable> = {};
  registerLineNotes(notes, "", mergedSeries, reportsByYear, extractedYears, entities, panel, 0);

  return {
    table: mergedSeries.table,
    notes,
    years: ranged.map((report) => report.year).sort((a, b) => a - b),
    entities,
    companyName: newest.company_name || newest.company_slug,
    unit: mergedSeries.table.unit || newest.unit || "",
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

    const grids: YearTable[] = [];
    const display = new Set<number>();
    for (const source of sources) {
      const table = reportsByYear.get(source.year)?.notes?.[source.ref];
      if (!table || !(table.rows?.length) || !isYearGrid(table)) continue;
      grids.push({ year: source.year, table });
      display.add(source.year);
      for (const slot of headerModel(table.header_rows ?? []).slots) {
        if (slot.kind === "year" && slot.year != null && extractedYears.has(slot.year)) {
          display.add(slot.year);
        }
      }
    }

    if (grids.length === 0) {
      const rawSource = [...sources].reverse().find((source) => {
        const table = reportsByYear.get(source.year)?.notes?.[source.ref];
        return (table?.rows?.length ?? 0) > 0;
      });
      const raw = rawSource
        ? reportsByYear.get(rawSource.year)?.notes?.[rawSource.ref]
        : undefined;
      if (!raw) {
        row.note_ref = null;
        return;
      }
      notes[lineKey] = { ...raw, title: fact.label || raw.title, source_notes: sources };
      row.note_ref = lineKey;
      return;
    }

    const child = mergeTableSeries(grids, panel, entities, [...display]);
    if (!child) {
      row.note_ref = null;
      return;
    }
    child.table.title = fact.label || child.table.title;
    child.table.source_notes = sources;
    notes[lineKey] = child.table;
    row.note_ref = lineKey;
    registerLineNotes(
      notes,
      lineKey,
      child,
      reportsByYear,
      extractedYears,
      entities,
      panel,
      depth + 1,
    );
  });
}
