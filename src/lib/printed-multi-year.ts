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
  return label.toLowerCase().replace(/\s+/g, " ").trim();
}

type RowFact = {
  label: string;
  style: string;
  note: string;
  page: string;
  noteRef: string | null;
  amounts: Map<string, string>;
  changes: Map<string, string>;
};

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
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const key = `${base}#${occurrence}`;
    const amounts = cells.slice(model.prefix);
    const values = readSlotValues(amounts, model, spacers);
    const fact: RowFact = facts.get(key) ?? {
      label,
      style: (row.style ?? "data").toLowerCase(),
      note: model.prefix > 1 ? cells[1] ?? "" : "",
      page: model.prefix > 2 ? cells[2] ?? "" : "",
      noteRef: row.note_ref ?? null,
      amounts: new Map(),
      changes: new Map(),
    };
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

  const perReport = ranged.map((report) => {
    const table = report.statements?.find((item) => item.key === statementKey);
    return {
      year: report.year,
      facts: table ? ingestReport(table, report.year) : new Map<string, RowFact>(),
    };
  });

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

  const entities: string[] = [];
  const newestModel = headerModel(statement.header_rows ?? []);
  for (const slot of newestModel.slots) {
    if (!entities.includes(slot.entity)) entities.push(slot.entity);
  }
  for (const fact of merged.values()) {
    for (const id of fact.amounts.keys()) {
      const entity = id.split("|")[0] ?? "";
      if (entity && !entities.includes(entity)) entities.push(entity);
    }
  }

  const shownEntities = entitiesForPanel(entities, panel);

  const reportYears = new Set(
    ranged.map((report) => report.year).filter((year) => inRange(year, fromYear, toYear)),
  );
  const years = [...reportYears].sort((a, b) => b - a);

  type Col = { entity: string; year: number; kind: "year" | "change" };
  const columns: Col[] = [];
  const yearBreaks: number[] = [];
  let columnIndex = 2;
  for (const entity of shownEntities) {
    let firstYear = true;
    for (const year of years) {
      if (!firstYear) yearBreaks.push(columnIndex);
      firstYear = false;
      columns.push({ entity, year, kind: "year" });
      columnIndex += 1;
    }
  }

  const bottom = ["", "Note"];
  for (const column of columns) {
    bottom.push(column.kind === "change" ? "Change %" : String(column.year));
  }

  const body: PrintedRow[] = order.map((key) => {
    const fact = merged.get(key)!;
    const cells = [fact.label, fact.note];
    for (const column of columns) {
      if (column.kind === "change") {
        cells.push(fact.changes.get(factKey(column.entity, column.year)) ?? "");
      } else {
        cells.push(fact.amounts.get(factKey(column.entity, column.year)) ?? "");
      }
    }
    return {
      cells,
      note_ref: fact.noteRef,
      style: fact.style,
    };
  });

  const notes: Record<string, PrintedTable> = {};
  for (const report of ranged) {
    for (const [ref, note] of Object.entries(report.notes ?? {})) {
      notes[ref] = note;
    }
  }

  return {
    table: {
      key: statement.key,
      title: statement.title,
      unit: statement.unit || newest.unit || "",
      pages: statement.pages,
      header_rows: [bottom],
      rows: body,
      note_column: 1,
      year_breaks: yearBreaks,
      ok: body.some((row) => (row.cells?.length ?? 0) > 2),
    },
    notes,
    years,
    entities,
    companyName: newest.company_name || newest.company_slug,
    unit: statement.unit || newest.unit || "",
  };
}
