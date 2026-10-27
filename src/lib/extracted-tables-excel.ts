import type {
  ExtractedStatement,
  ExtractedTable,
} from "@/components/extracted/extracted-tables-view";
import type { ExtractedExportMeta } from "@/lib/extracted-tables-export";
import { statementLabel } from "@/lib/statement-types";

export type ChangeKind = "h" | "r" | "caption" | "preamble" | "footnotes" | "title";

export type CellChange = {
  from: string;
  to: string;
};

export type CellChangeMap = Record<string, CellChange>;

export type UploadedTables = {
  statements: ExtractedStatement[];
  changes: CellChangeMap;
};

type XlsxModule = typeof import("xlsx");

type Slot =
  | { type: "doc" }
  | { type: "label"; text: string }
  | { type: "title"; statementKey: string }
  | { type: "preamble"; statementKey: string }
  | { type: "caption"; statementKey: string; tableIndex: number }
  | {
      type: "cells";
      statementKey: string;
      tableIndex: number;
      kind: "h" | "r";
      rowIndex: number;
    }
  | { type: "footnotes"; statementKey: string };

type ParsedTag =
  | { type: "key" }
  | { type: "title"; statementKey: string }
  | { type: "preamble"; statementKey: string }
  | { type: "foot"; statementKey: string }
  | { type: "caption"; statementKey: string; tableIndex: number }
  | {
      type: "header";
      statementKey: string;
      tableIndex: number;
      rowIndex: number;
    }
  | {
      type: "row";
      statementKey: string;
      tableIndex: number;
      rowIndex: number;
    };

const STATEMENT_LEVEL = -1;
const MISMATCH_MESSAGE =
  "That file doesn't match these tables. Download Excel from this page, change cell values, and upload the same file without adding or deleting rows.";

function loadXlsx(): Promise<XlsxModule> {
  return import("xlsx");
}

export function cellChangeKey(
  statementKey: string,
  tableIndex: number,
  kind: ChangeKind,
  rowIndex: number,
  colIndex: number,
) {
  return `${statementKey}\t${tableIndex}\t${kind}\t${rowIndex}\t${colIndex}`;
}

export function getCellChange(
  changes: CellChangeMap | null | undefined,
  statementKey: string,
  tableIndex: number,
  kind: ChangeKind,
  rowIndex: number,
  colIndex: number,
): CellChange | null {
  if (!changes) return null;
  return changes[cellChangeKey(statementKey, tableIndex, kind, rowIndex, colIndex)] ?? null;
}

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

function statementsWithTables(statements: ExtractedStatement[]) {
  return statements.filter(
    (s) => s.status !== "error" && (s.data?.tables?.length ?? 0) > 0,
  );
}

export function parseNumeric(value: string): number | null {
  let t = value.trim();
  if (!t || t === "-" || t === "—" || t === "–") return null;
  let negative = false;
  if (t.startsWith("(") && t.endsWith(")")) {
    negative = true;
    t = t.slice(1, -1).trim();
  }
  t = t.replace(/,/g, "").replace(/\s/g, "");
  if (t.endsWith("%")) t = t.slice(0, -1);
  if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}

function cleanNumber(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (Object.is(n, -0)) return 0;
  if (Number.isSafeInteger(Math.round(n))) return Math.round(n);
  const rounded = Number(n.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function numberKey(n: number): string {
  const cleaned = cleanNumber(n);
  if (Number.isSafeInteger(cleaned)) return String(cleaned);
  return cleaned.toFixed(6).replace(/\.?0+$/, "");
}

function canonical(value: string): string {
  const n = parseNumeric(value);
  if (n != null) return `n:${numberKey(n)}`;
  const t = value.trim().replace(/\s+/g, " ");
  if (t === "-" || t === "—" || t === "–") return "dash";
  return `s:${t}`;
}

function isDashOrEmpty(value: string) {
  const t = value.trim();
  return t === "" || t === "-" || t === "—" || t === "–";
}

function decimalPlaces(original: string): number {
  const core = original
    .trim()
    .replace(/[(),%\s]/g, "")
    .replace(/,/g, "")
    .replace(/^[+-]/, "");
  const frac = core.split(".")[1];
  return frac ? frac.length : 0;
}

function formatNumberLike(original: string, n: number): string {
  const trimmed = original.trim();
  const numericOriginal = parseNumeric(trimmed) != null;
  const useParens = /^\(.*\)$/.test(trimmed) || (!numericOriginal && n < 0);
  const useMinus = trimmed.startsWith("-");
  const usePercent = trimmed.includes("%");
  const useCommas = trimmed.includes(",") || (!numericOriginal && Math.abs(n) >= 1000);
  let decimals = numericOriginal ? decimalPlaces(trimmed) : 0;
  const cleaned = cleanNumber(n);
  if (!numericOriginal && !Number.isInteger(cleaned)) {
    const frac = String(cleaned).split(".")[1] ?? "";
    decimals = Math.min(frac.length, 4);
  }
  const body = Math.abs(cleaned).toLocaleString("en-US", {
    useGrouping: useCommas,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const withPercent = usePercent ? `${body}%` : body;
  if (cleaned < 0) {
    if (useMinus && !useParens) return `-${withPercent}`;
    return `(${withPercent})`;
  }
  return withPercent;
}

function rawText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof raw === "object" && raw && "richText" in raw) {
    const parts = (raw as { richText?: { text?: string }[] }).richText ?? [];
    return parts.map((part) => part.text ?? "").join("");
  }
  return String(raw);
}

function formatRaw(original: string, raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return formatNumberLike(original, raw);
  }
  if (raw instanceof Date) return rawText(raw);
  const text = rawText(raw).trim();
  const nextNum = parseNumeric(text);
  if (nextNum != null && (parseNumeric(original) != null || isDashOrEmpty(original))) {
    return formatNumberLike(original, nextNum);
  }
  return text;
}

function displayValue(original: string, raw: unknown): string {
  const formatted = formatRaw(original, raw);
  if (canonical(original) === canonical(formatted)) return original;
  return formatted;
}

function lastUsedIndex(raw: unknown[]): number {
  for (let i = raw.length - 1; i >= 0; i--) {
    const value = raw[i];
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return i;
  }
  return -1;
}

function assignCells(
  changes: CellChangeMap,
  statementKey: string,
  tableIndex: number,
  kind: "h" | "r",
  rowIndex: number,
  cells: string[],
  rawCells: unknown[],
) {
  const width = Math.max(cells.length, lastUsedIndex(rawCells) + 1);
  for (let col = 0; col < width; col++) {
    const original = cells[col] ?? "";
    const incoming = col < rawCells.length ? rawCells[col] : "";
    const display = displayValue(original, incoming);
    if (canonical(original) !== canonical(display)) {
      changes[cellChangeKey(statementKey, tableIndex, kind, rowIndex, col)] = {
        from: original,
        to: display,
      };
      cells[col] = display;
    }
  }
}

function assignScalar(
  changes: CellChangeMap,
  statementKey: string,
  tableIndex: number,
  kind: "title" | "preamble" | "footnotes" | "caption",
  original: string,
  raw: unknown,
): string {
  const display = displayValue(original, raw);
  if (canonical(original) !== canonical(display)) {
    changes[cellChangeKey(statementKey, tableIndex, kind, 0, 0)] = {
      from: original,
      to: display,
    };
    return display;
  }
  return original;
}

function sheetNameFor(label: string, key: string, used: Set<string>) {
  const cleaned = (label || key || "Sheet")
    .replace(/[\\/?*[\]:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const base = (cleaned || "Sheet").slice(0, 31);
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` ${n++}`;
    name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(name.toLowerCase());
  return name;
}

function excelValue(value: string): string | number {
  if (value.includes("%")) return value;
  const n = parseNumeric(value);
  return n == null ? value : n;
}

function excelNumberFormat(original: string): string | undefined {
  if (parseNumeric(original) == null || original.includes("%")) return undefined;
  const decimals = decimalPlaces(original);
  const grouped = original.includes(",");
  const base =
    decimals > 0
      ? `${grouped ? "#,##0" : "0"}.${"0".repeat(decimals)}`
      : grouped
        ? "#,##0"
        : "0";
  if (/^\s*\(/.test(original)) return `${base};(${base})`;
  if (original.trim().startsWith("-")) return `${base};-${base}`;
  return base;
}

type SheetRow = { tag: string; values: string[] };

function statementSheetRows(statement: ExtractedStatement): SheetRow[] {
  const rows: SheetRow[] = [
    {
      tag: `KEY|${statement.key}`,
      values: [
        statement.key,
        "Edit values only. Do not insert, delete, or reorder rows.",
      ],
    },
  ];
  if (statement.data?.statement_title) {
    rows.push({
      tag: `TITLE|${statement.key}`,
      values: [statement.data.statement_title],
    });
  }
  if (statement.data?.preamble) {
    rows.push({
      tag: `PREAMBLE|${statement.key}`,
      values: [statement.data.preamble],
    });
  }
  (statement.data?.tables ?? []).forEach((table, tableIndex) => {
    if (tableIndex > 0) rows.push({ tag: "", values: [] });
    if (table.caption) {
      rows.push({
        tag: `CAPTION|${statement.key}|${tableIndex}`,
        values: [table.caption],
      });
    }
    (table.header_rows ?? []).forEach((header, headerIndex) => {
      rows.push({
        tag: `HEADER|${statement.key}|${tableIndex}|${headerIndex}`,
        values: header.map((cell) => String(cell ?? "")),
      });
    });
    (table.rows ?? []).forEach((row, rowIndex) => {
      if ((row.style ?? "data") === "blank") return;
      rows.push({
        tag: `ROW|${statement.key}|${tableIndex}|${rowIndex}|${row.style ?? "data"}`,
        values: (row.cells ?? []).map((cell) => String(cell ?? "")),
      });
    });
  });
  if (statement.data?.footnotes) {
    rows.push({
      tag: `FOOT|${statement.key}`,
      values: [statement.data.footnotes],
    });
  }
  return rows;
}

function parseTag(tag: string): ParsedTag | null {
  if (tag === "KEY" || tag.startsWith("KEY|")) return { type: "key" };
  const parts = tag.split("|");
  const kind = parts[0];
  const statementKey = parts[1] ?? "";
  if (!statementKey) return null;
  if (kind === "TITLE") return { type: "title", statementKey };
  if (kind === "PREAMBLE") return { type: "preamble", statementKey };
  if (kind === "FOOT") return { type: "foot", statementKey };
  if (kind === "CAPTION") {
    const tableIndex = Number(parts[2]);
    if (!Number.isInteger(tableIndex)) return null;
    return { type: "caption", statementKey, tableIndex };
  }
  if (kind === "HEADER") {
    const tableIndex = Number(parts[2]);
    const rowIndex = Number(parts[3]);
    if (!Number.isInteger(tableIndex) || !Number.isInteger(rowIndex)) return null;
    return { type: "header", statementKey, tableIndex, rowIndex };
  }
  if (kind === "ROW") {
    const tableIndex = Number(parts[2]);
    const rowIndex = Number(parts[3]);
    if (!Number.isInteger(tableIndex) || !Number.isInteger(rowIndex)) return null;
    return { type: "row", statementKey, tableIndex, rowIndex };
  }
  return null;
}

function isTaggedMatrix(matrix: unknown[][]) {
  return matrix.some((row) => parseTag(String(row?.[0] ?? "").trim()) != null);
}

function matrixFromSheet(XLSX: XlsxModule, sheet: XlsxModule.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
    blankrows: true,
  }) as unknown[][];
}

function tableAt(statement: ExtractedStatement, tableIndex: number): ExtractedTable | null {
  return statement.data?.tables?.[tableIndex] ?? null;
}

function applyParsed(
  statement: ExtractedStatement,
  parsed: Exclude<ParsedTag, { type: "key" }>,
  raw: unknown[],
  changes: CellChangeMap,
): boolean {
  const data = statement.data;
  if (!data) return false;
  if (parsed.type === "title") {
    const original = data.statement_title ?? "";
    const next = assignScalar(
      changes,
      statement.key,
      STATEMENT_LEVEL,
      "title",
      original,
      raw[0],
    );
    if (next !== original) data.statement_title = next;
    return true;
  }
  if (parsed.type === "preamble") {
    const original = data.preamble ?? "";
    const next = assignScalar(
      changes,
      statement.key,
      STATEMENT_LEVEL,
      "preamble",
      original,
      raw[0],
    );
    if (next !== original) data.preamble = next;
    return true;
  }
  if (parsed.type === "foot") {
    const original = data.footnotes ?? "";
    const next = assignScalar(
      changes,
      statement.key,
      STATEMENT_LEVEL,
      "footnotes",
      original,
      raw[0],
    );
    if (next !== original) data.footnotes = next;
    return true;
  }
  const table = tableAt(statement, parsed.tableIndex);
  if (!table) return false;
  if (parsed.type === "caption") {
    const original = table.caption ?? "";
    const next = assignScalar(
      changes,
      statement.key,
      parsed.tableIndex,
      "caption",
      original,
      raw[0],
    );
    if (next !== original) table.caption = next;
    return true;
  }
  if (parsed.type === "header") {
    const header = table.header_rows?.[parsed.rowIndex];
    if (!header) return false;
    assignCells(changes, statement.key, parsed.tableIndex, "h", parsed.rowIndex, header, raw);
    return true;
  }
  const row = table.rows?.[parsed.rowIndex];
  if (!row) return false;
  if (!row.cells) row.cells = [];
  assignCells(changes, statement.key, parsed.tableIndex, "r", parsed.rowIndex, row.cells, raw);
  return true;
}

function applyTaggedWorkbook(
  XLSX: XlsxModule,
  workbook: XlsxModule.WorkBook,
  next: ExtractedStatement[],
  changes: CellChangeMap,
) {
  const matched = new Set<string>();
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const matrix = matrixFromSheet(XLSX, sheet);
    for (const row of matrix) {
      const parsed = parseTag(String(row?.[0] ?? "").trim());
      if (!parsed || parsed.type === "key") continue;
      const statement = next.find((item) => item.key === parsed.statementKey);
      if (!statement?.data) continue;
      if (applyParsed(statement, parsed, row.slice(1), changes)) {
        matched.add(statement.key);
      }
    }
  }
  if (matched.size === 0) throw new Error(MISMATCH_MESSAGE);
}

function isBlankRow(row: unknown[]) {
  return row.every((cell) => String(cell ?? "").trim() === "");
}

function csvSlots(statements: ExtractedStatement[]): Slot[] {
  const slots: Slot[] = [{ type: "doc" }];
  statementsWithTables(statements).forEach((statement) => {
    slots.push({
      type: "label",
      text: statementLabel(statement.key, statement.title),
    });
    if (statement.data?.statement_title) {
      slots.push({ type: "title", statementKey: statement.key });
    }
    if (statement.data?.preamble) {
      slots.push({ type: "preamble", statementKey: statement.key });
    }
    (statement.data?.tables ?? []).forEach((table, tableIndex) => {
      const headerRows = table.header_rows ?? [];
      const dataRows = (table.rows ?? [])
        .map((row, rowIndex) => ({ row, rowIndex }))
        .filter(({ row }) => (row.style ?? "data") !== "blank");
      if (headerRows.length === 0 && dataRows.length === 0) return;
      if (table.caption) {
        slots.push({ type: "caption", statementKey: statement.key, tableIndex });
      }
      headerRows.forEach((_, rowIndex) => {
        slots.push({
          type: "cells",
          statementKey: statement.key,
          tableIndex,
          kind: "h",
          rowIndex,
        });
      });
      dataRows.forEach(({ rowIndex }) => {
        slots.push({
          type: "cells",
          statementKey: statement.key,
          tableIndex,
          kind: "r",
          rowIndex,
        });
      });
    });
    if (statement.data?.footnotes) {
      slots.push({ type: "footnotes", statementKey: statement.key });
    }
  });
  return slots;
}

function applySlot(
  slot: Slot,
  row: unknown[],
  next: ExtractedStatement[],
  changes: CellChangeMap,
) {
  if (slot.type === "doc") return;
  if (slot.type === "label") {
    const actual = String(row[0] ?? "").trim();
    if (canonical(actual) !== canonical(slot.text)) throw new Error(MISMATCH_MESSAGE);
    return;
  }
  const statement = next.find((item) => item.key === slot.statementKey);
  if (!statement?.data) throw new Error(MISMATCH_MESSAGE);
  if (slot.type === "title") {
    const original = statement.data.statement_title ?? "";
    const updated = assignScalar(
      changes,
      statement.key,
      STATEMENT_LEVEL,
      "title",
      original,
      row[0],
    );
    if (updated !== original) statement.data.statement_title = updated;
    return;
  }
  if (slot.type === "preamble") {
    const original = statement.data.preamble ?? "";
    const updated = assignScalar(
      changes,
      statement.key,
      STATEMENT_LEVEL,
      "preamble",
      original,
      row[0],
    );
    if (updated !== original) statement.data.preamble = updated;
    return;
  }
  if (slot.type === "footnotes") {
    const first = String(row[0] ?? "").trim();
    const raw = first.toLowerCase() === "footnotes" ? row[1] : row[0];
    const original = statement.data.footnotes ?? "";
    const updated = assignScalar(
      changes,
      statement.key,
      STATEMENT_LEVEL,
      "footnotes",
      original,
      raw,
    );
    if (updated !== original) statement.data.footnotes = updated;
    return;
  }
  if (slot.type === "caption") {
    const table = tableAt(statement, slot.tableIndex);
    if (!table) throw new Error(MISMATCH_MESSAGE);
    const original = table.caption ?? "";
    const updated = assignScalar(
      changes,
      statement.key,
      slot.tableIndex,
      "caption",
      original,
      row[0],
    );
    if (updated !== original) table.caption = updated;
    return;
  }
  const table = tableAt(statement, slot.tableIndex);
  if (!table) throw new Error(MISMATCH_MESSAGE);
  if (slot.kind === "h") {
    const header = table.header_rows?.[slot.rowIndex];
    if (!header) throw new Error(MISMATCH_MESSAGE);
    assignCells(changes, statement.key, slot.tableIndex, "h", slot.rowIndex, header, row);
    return;
  }
  const dataRow = table.rows?.[slot.rowIndex];
  if (!dataRow) throw new Error(MISMATCH_MESSAGE);
  if (!dataRow.cells) dataRow.cells = [];
  assignCells(changes, statement.key, slot.tableIndex, "r", slot.rowIndex, dataRow.cells, row);
}

function applyCsvMatrix(matrix: unknown[][], next: ExtractedStatement[], changes: CellChangeMap) {
  const rows = matrix.filter((row) => !isBlankRow(row));
  const slots = csvSlots(next);
  if (slots[0]?.type === "doc" && rows.length > 0) {
    const label = slots.find((slot) => slot.type === "label");
    const first = String(rows[0]?.[0] ?? "").trim();
    if (label && label.type === "label" && canonical(first) === canonical(label.text)) {
      slots.shift();
    }
  }
  if (rows.length !== slots.length) throw new Error(MISMATCH_MESSAGE);
  rows.forEach((row, index) => {
    const slot = slots[index];
    if (!slot) throw new Error(MISMATCH_MESSAGE);
    applySlot(slot, row, next, changes);
  });
}

function workbookHasTags(XLSX: XlsxModule, workbook: XlsxModule.WorkBook) {
  return workbook.SheetNames.some((name) => {
    const sheet = workbook.Sheets[name];
    return sheet ? isTaggedMatrix(matrixFromSheet(XLSX, sheet)) : false;
  });
}

function readWorkbook(XLSX: XlsxModule, data: ArrayBuffer | Uint8Array) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  try {
    return XLSX.read(bytes, { type: "array", cellDates: true });
  } catch {
    throw new Error("Could not read that file. Upload an Excel workbook (.xlsx) or CSV.");
  }
}

export async function buildExtractedTablesWorkbookBytes(
  statements: ExtractedStatement[],
  meta: ExtractedExportMeta,
): Promise<Uint8Array> {
  const usable = statementsWithTables(statements);
  if (usable.length === 0) {
    throw new Error("There are no extracted tables to download.");
  }
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  usable.forEach((statement) => {
    const sheetRows = statementSheetRows(statement);
    const aoa = sheetRows.map((row) => [row.tag, ...row.values.map((value) => excelValue(value))]);
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    const width = Math.max(...aoa.map((row) => row.length), 1);
    sheet["!cols"] = Array.from({ length: width }, (_, index) =>
      index === 0 ? { hidden: true, wch: 0 } : { wch: index === 1 ? 48 : 20 },
    );
    sheet["!rows"] = [{ hidden: true }];
    sheetRows.forEach((row, rowIndex) => {
      row.values.forEach((original, valueIndex) => {
        const format = excelNumberFormat(original);
        if (!format) return;
        const address = XLSX.utils.encode_cell({ r: rowIndex, c: valueIndex + 1 });
        const cell = sheet[address];
        if (cell && cell.t === "n") cell.z = format;
      });
    });
    const label = statementLabel(statement.key, statement.title);
    XLSX.utils.book_append_sheet(
      workbook,
      sheet,
      sheetNameFor(label, statement.key, usedNames),
    );
  });
  const out = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer | Uint8Array;
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

export async function downloadExtractedTablesXlsx(
  statements: ExtractedStatement[],
  meta: ExtractedExportMeta,
) {
  const bytes = await buildExtractedTablesWorkbookBytes(statements, meta);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  triggerDownload(blob, `${buildBaseName(meta)}.xlsx`);
}

export async function readUploadedTablesFromBuffer(
  data: ArrayBuffer | Uint8Array,
  filename: string,
  statements: ExtractedStatement[],
): Promise<UploadedTables> {
  if (!/\.(xlsx|xls|csv)$/i.test(filename)) {
    throw new Error("Upload an Excel file (.xlsx) or CSV downloaded from this page.");
  }
  if (statementsWithTables(statements).length === 0) {
    throw new Error("There are no extracted tables to update.");
  }
  const XLSX = await loadXlsx();
  const workbook = readWorkbook(XLSX, data);
  if (workbook.SheetNames.length === 0) throw new Error(MISMATCH_MESSAGE);
  const next = structuredClone(statements) as ExtractedStatement[];
  const changes: CellChangeMap = {};
  if (workbookHasTags(XLSX, workbook)) {
    applyTaggedWorkbook(XLSX, workbook, next, changes);
    return { statements: next, changes };
  }
  const sheetName =
    workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      if (!sheet) return false;
      return matrixFromSheet(XLSX, sheet).some((row) => !isBlankRow(row));
    }) ?? workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error(MISMATCH_MESSAGE);
  applyCsvMatrix(matrixFromSheet(XLSX, sheet), next, changes);
  return { statements: next, changes };
}
