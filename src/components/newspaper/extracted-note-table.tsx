"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { NoteExtractedTable } from "@/lib/newspaper-db";

type ExtractedNoteTablesProps = {
  tables: NoteExtractedTable[];
  className?: string;
  /** Report year shown beside the Group/Bank switch footer. */
  yearLabel?: string;
  /**
   * Size to the full table width with no nested horizontal scrollbar.
   * Used when notes are shown under year columns in the DB grid.
   */
  fitContent?: boolean;
};

type EntityPanel = "group" | "bank";

type SplitNoteTables = {
  group: NoteExtractedTable;
  bank: NoteExtractedTable;
  bankLabel: string;
};

function rowStyleClass(style: NoteExtractedTable["rows"][number]["style"]) {
  const value = typeof style === "string" ? style.toLowerCase() : "";
  if (value === "section") {
    return "bg-teal-950/40 text-teal-50/95 font-semibold";
  }
  if (value === "total") {
    return "bg-amber-950/35 font-bold text-amber-50 border-t border-amber-500/30";
  }
  if (value === "subtotal") {
    return "bg-muted/50 font-semibold";
  }
  if (value === "blank") return "h-5";
  return "";
}

function headerCellTone(text: string): string {
  const normalized = normalizeHeaderCell(text);
  if (
    normalized === "GROUP" ||
    normalized === "BANK" ||
    normalized === "COMPANY"
  ) {
    return "bg-teal-950/55 text-teal-50";
  }
  if (
    /^(19|20)\d{2}/.test(text.trim()) ||
    /rs\.?|lkr|'000/i.test(text)
  ) {
    return "bg-slate-900/80 text-slate-100";
  }
  if (normalized === "NOTE") {
    return "bg-muted/80 text-muted-foreground";
  }
  return "bg-muted/60 text-foreground";
}

function YearBadge({ year }: { year: string }) {
  return (
    <span
      aria-hidden
      className="relative z-10 shrink-0 text-2xl font-semibold tabular-nums leading-none text-muted-foreground/40"
    >
      {year}
    </span>
  );
}

function normalizeHeaderCell(value: string | undefined | null): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseNoteAmount(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  let s = String(raw).replace(/\s+/g, " ").trim();
  if (!s || s === "-" || s === "—" || s === "–") return null;
  const amountMatch = s.match(
    /\(?-?\d{1,3}(?:,\d{3})+(?:\.\d+)?\)?|\(?-?\d{5,}(?:\.\d+)?\)?/g,
  );
  if (amountMatch && amountMatch.length > 0) {
    s = amountMatch[amountMatch.length - 1];
  }
  s = s.replace(/,/g, "").replace(/\s+/g, "").trim();
  const neg = s.startsWith("(") && s.endsWith(")");
  if (neg) s = s.slice(1, -1);
  if (s.startsWith("+")) s = s.slice(1);
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export type NoteBreakdownLine = {
  /** Display label (from note table first column). */
  label: string;
  style?: string;
  /** Current-year amount keyed by report year (Group or Bank/Company). */
  values: Record<string, number | null>;
};

export type NoteEntityPanel = "group" | "bank";

/**
 * Prefer GROUP or BANK/COMPANY projection of a note table.
 */
export function resolveNoteEntityTable(
  table: NoteExtractedTable,
  entity: NoteEntityPanel = "group",
): NoteExtractedTable {
  const split = splitGroupBankTable(table);
  if (!split) return table;
  return entity === "bank" ? split.bank : split.group;
}

/**
 * Prefer the GROUP projection of a note table (split from GROUP+BANK when needed).
 */
export function resolveGroupNoteTable(
  table: NoteExtractedTable,
): NoteExtractedTable {
  return resolveNoteEntityTable(table, "group");
}

/** True when any note table for this parent has GROUP + BANK/COMPANY columns. */
export function noteTablesHaveBankEntity(
  noteTablesByYear: Record<string, NoteExtractedTable[]> | undefined,
): { available: boolean; bankLabel: string } {
  if (!noteTablesByYear) return { available: false, bankLabel: "Bank" };
  for (const tables of Object.values(noteTablesByYear)) {
    for (const table of tables ?? []) {
      const split = splitGroupBankTable(table);
      if (split) return { available: true, bankLabel: split.bankLabel };
    }
  }
  return { available: false, bankLabel: "Bank" };
}

/**
 * Amount for one report year from extracted note tables, for Group or Bank.
 * Prefers a row matching `parentLabel`, otherwise the Total row.
 */
export function getNoteEntityAmountForYear(
  tables: NoteExtractedTable[] | undefined,
  year: string,
  entity: NoteEntityPanel,
  parentLabel?: string,
): number | null {
  if (!tables?.length) return null;

  for (const raw of tables) {
    const table = resolveNoteEntityTable(raw, entity);
    const yearCol = findNoteYearColumnIndex(table, year);
    if (yearCol < 0) continue;
    const rows = table.rows || [];

    if (parentLabel) {
      const norm = normalizeNoteBreakdownLabel(parentLabel);
      for (const row of rows) {
        const label = String(row.cells?.[0] ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (!label) continue;
        if (normalizeNoteBreakdownLabel(label) === norm) {
          const amount = parseNoteAmount(row.cells?.[yearCol]);
          if (amount != null) return amount;
        }
      }
    }

    for (const row of rows) {
      const style =
        typeof row.style === "string" ? row.style.toLowerCase() : "";
      const label = String(row.cells?.[0] ?? "")
        .replace(/\s+/g, " ")
        .trim();
      if (style === "total" || /^totals?\b/i.test(label)) {
        const amount = parseNoteAmount(row.cells?.[yearCol]);
        if (amount != null) return amount;
      }
    }
  }
  return null;
}

/**
 * Parent-row amounts for the selected Group/Bank entity, taken from extracted
 * note captures (matching line label, else the Total row).
 */
export function getNoteEntityParentValues(
  noteTablesByYear: Record<string, NoteExtractedTable[]> | undefined,
  columnKeys: string[],
  entity: NoteEntityPanel,
  parentLabel: string,
): Record<string, number | null> | null {
  if (!noteTablesByYear) return null;
  const out: Record<string, number | null> = {};
  let any = false;
  for (const year of columnKeys) {
    const amount = getNoteEntityAmountForYear(
      noteTablesByYear[year],
      year,
      entity,
      parentLabel,
    );
    if (amount == null) continue;
    out[year] = amount;
    any = true;
  }
  return any ? out : null;
}

/** Find the column index for a report year in note headers (GROUP current year). */
export function findNoteYearColumnIndex(
  table: NoteExtractedTable,
  year: string,
): number {
  const yearRe = new RegExp(`\\b${year}\\b`);
  const headerRows = table.header_rows || [];
  const width = Math.max(
    1,
    ...headerRows.map((row) => row.length),
    ...(table.rows || []).map((r) => r.cells?.length ?? 0),
  );

  const columnHeader = (index: number) =>
    headerRows.map((row) => String(row[index] ?? "")).join("\n");

    const isRateOrMeta = (text: string) => {
    const n = normalizeHeaderCell(text);
    if (!n) return false;
    if (
      n === "NOTE" ||
      n === "PAGE NO." ||
      n === "PAGE NO" ||
      n === "PAGE" ||
      n === "REF"
    ) {
      return true;
    }
    return /%|tax rate|applicable|change/i.test(text);
  };

  const columnLooksLikeTaxRate = (index: number) => {
    const text = columnHeader(index);
    if (isRateOrMeta(text)) return true;
    const compact = normalizeHeaderCell(text).replace(/\s+/g, " ");
    if (/^\d{1,2}(\.\d+)?%?$/.test(compact)) return true;
    const nums: number[] = [];
    for (const row of table.rows || []) {
      const n = parseNoteAmount(row.cells?.[index]);
      if (n != null) nums.push(Math.abs(n));
    }
    return nums.length >= 3 && nums.every((v) => v > 0 && v <= 100);
  };

  const columnAmountMagnitude = (index: number) => {
    let max = 0;
    for (const row of table.rows || []) {
      const n = parseNoteAmount(row.cells?.[index]);
      if (n != null) max = Math.max(max, Math.abs(n));
    }
    return max;
  };

  let best = -1;
  let bestScore = -1;
  for (let i = 1; i < width; i += 1) {
    const text = columnHeader(i);
    if (isRateOrMeta(text) || columnLooksLikeTaxRate(i)) continue;
    if (!yearRe.test(text)) continue;
    let score = 10;
    if (/rs\.?|lkr|'000/i.test(text)) score += 6;
    if (/\bgroup\b/i.test(text)) score += 3;
    const mag = columnAmountMagnitude(i);
    if (mag >= 1000) score += 8;
    else if (mag > 0 && mag <= 100) score -= 12;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best >= 0) return best;

  for (let i = 1; i < width; i += 1) {
    const text = columnHeader(i);
    if (isRateOrMeta(text) || columnLooksLikeTaxRate(i)) continue;
    if (/rs\.?|lkr|'000/i.test(text) || /\bgroup\b/i.test(text)) return i;
  }

  let fallback = -1;
  let fallbackMag = -1;
  for (let i = 1; i < width; i += 1) {
    if (isRateOrMeta(columnHeader(i)) || columnLooksLikeTaxRate(i)) continue;
    const mag = columnAmountMagnitude(i);
    if (mag > fallbackMag) {
      fallbackMag = mag;
      fallback = i;
    }
  }
  if (fallback >= 0 && fallbackMag >= 1000) return fallback;
  return -1;
}

const MONTH_NAMES =
  "january|february|march|april|may|june|july|august|september|october|november|december";
const MONTH_DAY_RE = new RegExp(`\\b(${MONTH_NAMES})\\s+0*(\\d{1,2})\\b`, "gi");
const DAY_MONTH_RE = new RegExp(`\\b0*(\\d{1,2})\\s+(${MONTH_NAMES})\\b`, "gi");
const OPPOSING_LABEL_PAIRS: Array<[string, string]> = [
  ["january", "december"],
  ["opening", "closing"],
  ["income", "expense"],
  ["asset", "liability"],
  ["addition", "disposal"],
  ["debit", "credit"],
];

/** Vertical PDF margin text is often OCR'd backwards (statements → stnemetats). */
const MARGIN_FORWARD_WORDS = [
  "statements",
  "financial",
  "notes",
  "note",
  "report",
  "annual",
  "pages",
  "page",
  "year",
  "these",
  "form",
  "part",
  "integral",
  "the",
  "to",
] as const;

function sidebarNoiseTokens(): string[] {
  const tokens = new Set<string>(["eht", "ot"]);
  for (const word of MARGIN_FORWARD_WORDS) {
    const reversed = word.split("").reverse().join("");
    tokens.add(reversed);
    const minN = reversed.length >= 8 ? 3 : Math.min(4, reversed.length);
    for (let n = minN; n <= reversed.length; n += 1) {
      tokens.add(reversed.slice(0, n));
    }
  }
  return [...tokens].sort((a, b) => b.length - a.length);
}

const SIDEBAR_NOISE_TOKEN_LIST = sidebarNoiseTokens();
const SIDEBAR_NOISE_TOKEN_SET = new Set(SIDEBAR_NOISE_TOKEN_LIST);
const SIDEBAR_NOISE_ALTS = SIDEBAR_NOISE_TOKEN_LIST.join("|");
const SIDEBAR_NOISE_RE = new RegExp(`\\b(?:${SIDEBAR_NOISE_ALTS})\\b`, "gi");
const SIDEBAR_NOISE_TRAILING_RE = new RegExp(`(?:${SIDEBAR_NOISE_ALTS})$`, "i");
const MARGIN_FORWARD_SET = new Set<string>(MARGIN_FORWARD_WORDS);

function isLabelNoiseToken(token: string): boolean {
  const text = token.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!text) return true;
  if (SIDEBAR_NOISE_TOKEN_SET.has(text)) return true;
  if (/^\d{3,4}$/.test(text)) return true;
  return MARGIN_FORWARD_SET.has(text.split("").reverse().join(""));
}

function stripSidebarNoise(text: string): string {
  SIDEBAR_NOISE_RE.lastIndex = 0;
  const cleaned = text
    .replace(SIDEBAR_NOISE_RE, " ")
    .replace(SIDEBAR_NOISE_TRAILING_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter(Boolean);
  while (parts.length > 1 && isLabelNoiseToken(parts[parts.length - 1] ?? "")) {
    parts.pop();
  }
  return parts.join(" ");
}

function collapseTotalLikeLabel(text: string): string {
  const match = text.match(/^((?:sub)?totals?)\b(.*)$/i);
  if (!match) return text;
  const head = match[1] ?? text;
  const rest = (match[2] ?? "").trim();
  if (!rest) return head;
  const tokens = rest.match(/[A-Za-z0-9]+/g) ?? [];
  if (tokens.length && tokens.every(isLabelNoiseToken)) return head;
  return text;
}

function titleMonth(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
}

/** Stable printed label: dates, trailing commas, footnote markers. */
export function canonicalizeNoteDisplayLabel(label: string): string {
  MONTH_DAY_RE.lastIndex = 0;
  DAY_MONTH_RE.lastIndex = 0;
  let text = String(label || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*\(\*+\)\s*$/g, "")
    .replace(/\s*\*+\s*$/g, "")
    .replace(/\s*\[[0-9a-z]+\]\s*$/gi, "")
    .trim();
  text = stripSidebarNoise(text);
  text = text.replace(MONTH_DAY_RE, (_, month: string, day: string) => {
    return `${titleMonth(month)} ${Number(day)}`;
  });
  text = text.replace(DAY_MONTH_RE, (_, day: string, month: string) => {
    return `${Number(day)} ${titleMonth(month)}`;
  });
  return collapseTotalLikeLabel(text.replace(/[,:;]+$/g, "").trim());
}

/**
 * Normalize note line labels so cross-year merges ignore footnotes, dates,
 * and punctuation (e.g. "January 01," vs "January 1").
 */
export function normalizeNoteBreakdownLabel(label: string): string {
  DAY_MONTH_RE.lastIndex = 0;
  let text = canonicalizeNoteDisplayLabel(label).toLowerCase();
  text = text.replace(DAY_MONTH_RE, (_, day: string, month: string) => {
    return `${String(month).toLowerCase()} ${Number(day)}`;
  });
  text = text.replace(/\bprivate\b/g, "pvt").replace(/\blimited\b/g, "ltd");
  return text.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function hasOpposingLabelTokens(left: string, right: string): boolean {
  return OPPOSING_LABEL_PAIRS.some(
    ([a, b]) =>
      (left.includes(a) && right.includes(b)) ||
      (left.includes(b) && right.includes(a)),
  );
}

function labelKeysMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (hasOpposingLabelTokens(left, right)) return false;
  const tokensA = new Set(left.split(" ").filter(Boolean));
  const tokensB = new Set(right.split(" ").filter(Boolean));
  if (tokensA.size && tokensB.size) {
    const [smaller, larger] =
      tokensA.size <= tokensB.size ? [tokensA, tokensB] : [tokensB, tokensA];
    const extra = [...larger].filter((token) => !smaller.has(token));
    const smallerIsSubset = [...smaller].every((token) => larger.has(token));
    if (smallerIsSubset && extra.length && extra.every(isLabelNoiseToken)) {
      return true;
    }
  }
  if (!tokensA.size || !tokensB.size) return false;
  let inter = 0;
  for (const token of tokensA) if (tokensB.has(token)) inter += 1;
  const union = tokensA.size + tokensB.size - inter;
  const overlap = union ? inter / union : 0;
  return overlap >= 0.85 && Math.abs(tokensA.size - tokensB.size) <= 3;
}

/** Prefer the complete printed label over a wrapped fragment. */
function preferDisplayLabel(current: string, incoming: string): string {
  const cleanIncoming = canonicalizeNoteDisplayLabel(incoming);
  const cleanCurrent = canonicalizeNoteDisplayLabel(current);
  const a = cleanCurrent.toLowerCase();
  const b = cleanIncoming.toLowerCase();
  const noise = (label: string) =>
    label
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .filter(isLabelNoiseToken).length;
  if (a && b && (a.endsWith(b) || b.endsWith(a) || a.includes(b) || b.includes(a))) {
    const scoreA = noise(cleanCurrent);
    const scoreB = noise(cleanIncoming);
    if (scoreA !== scoreB) {
      return scoreA < scoreB ? cleanCurrent || current : cleanIncoming || incoming;
    }
    return cleanIncoming.length >= cleanCurrent.length
      ? cleanIncoming || incoming
      : cleanCurrent || current;
  }
  if (/\(\*+\)|\*$/.test(current) && !/\(\*+\)|\*$/.test(incoming)) {
    return cleanIncoming || incoming;
  }
  return cleanCurrent || current;
}

function isWrapFragmentOf(shortKey: string, longKey: string): boolean {
  if (!shortKey || !longKey || shortKey === longKey) return false;
  if (shortKey.length < 12 || !longKey.endsWith(shortKey)) return false;
  if (/^[a-z]/.test(shortKey)) return true;
  const prefix = longKey
    .slice(0, longKey.length - shortKey.length)
    .replace(/[\s-–—]+$/g, "")
    .trim();
  return /^(financial assets at amortised cost|financial assets measured at fair value through|financial assets recognised through profit or loss)$/i.test(
    prefix,
  );
}

function findRelatedBreakdownAcc<T extends { label: string; values?: Record<string, number | null> }>(
  byNorm: Map<string, T>,
  norm: string,
  year?: string,
): T | undefined {
  const exact = byNorm.get(norm);
  if (exact) return exact;
  const candidates: T[] = [];
  for (const [key, acc] of byNorm) {
    if (key === norm) continue;
    if (year && acc.values && acc.values[year] != null) continue;
    const longKey = key.length >= norm.length ? key : norm;
    const shortKey = key.length < norm.length ? key : norm;
    if (isWrapFragmentOf(shortKey, longKey) || labelKeysMatch(key, norm)) {
      candidates.push(acc);
    }
  }
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    return [...candidates].sort((a, b) => b.label.length - a.label.length)[0];
  }
  return undefined;
}

/**
 * Build indented note-breakdown lines under a parent FS row.
 * Labels are shared across years; values follow Group or Bank/Company.
 * These lines are display-only (not FS keywords / not search catalog entries).
 *
 * Complete rows (a value in every year that has this note) sort first.
 * Partial rows follow, ordered by how many years they appear in.
 */
export function buildNoteBreakdownLines(
  noteTablesByYear: Record<string, NoteExtractedTable[]> | undefined,
  columnKeys: string[],
  entity: NoteEntityPanel = "group",
): NoteBreakdownLine[] {
  if (!noteTablesByYear) return [];

  type Acc = {
    label: string;
    style?: string;
    values: Record<string, number | null>;
    order: number;
  };
  const byNorm = new Map<string, Acc>();
  let orderCounter = 0;

  const yearsWithTables = columnKeys.filter(
    (year) => (noteTablesByYear[year]?.length ?? 0) > 0,
  );

  const rowCountForYear = (year: string): number => {
    let count = 0;
    for (const raw of noteTablesByYear[year] ?? []) {
      const table = resolveNoteEntityTable(raw, entity);
      for (const row of table.rows || []) {
        const style =
          typeof row.style === "string" ? row.style.toLowerCase() : "";
        if (style === "blank") continue;
        const label = String(row.cells?.[0] ?? "")
          .replace(/\s+/g, " ")
          .trim();
        if (label) count += 1;
      }
    }
    return count;
  };

  let bestYear = "";
  let bestCount = -1;
  for (const year of columnKeys) {
    const count = rowCountForYear(year);
    if (count > bestCount) {
      bestCount = count;
      bestYear = year;
    }
  }
  const orderedYears =
    bestYear && bestCount > 0
      ? [bestYear, ...columnKeys.filter((year) => year !== bestYear)]
      : columnKeys;

  const isTotalLike = (label: string, style?: string) => {
    if (style === "total") return true;
    return /^totals?\b/i.test(label.trim());
  };

  for (const year of orderedYears) {
    const tables = noteTablesByYear[year] ?? [];
    if (tables.length === 0) continue;

    for (const rawTable of tables) {
      const table = resolveNoteEntityTable(rawTable, entity);
      const yearCol = findNoteYearColumnIndex(table, year);
      if (yearCol < 0) continue;

      for (const row of table.rows || []) {
        const styleRaw = row.style;
        const style =
          typeof styleRaw === "string" ? styleRaw.toLowerCase() : "";
        if (style === "blank") continue;
        const rawLabel = canonicalizeNoteDisplayLabel(
          String(row.cells?.[0] ?? "").replace(/\s+/g, " ").trim(),
        );
        if (!rawLabel) continue;
        if (
          rawLabel.length > 140 ||
          /accounting policy|the group measures|slfrs\s*\d|lkas\s*\d/i.test(
            rawLabel,
          )
        ) {
          continue;
        }
        const norm = normalizeNoteBreakdownLabel(rawLabel);
        if (!norm) continue;
        let acc = findRelatedBreakdownAcc(byNorm, norm, year);
        if (!acc) {
          acc = {
            label: preferDisplayLabel(rawLabel, rawLabel),
            style: style || undefined,
            values: {},
            order: orderCounter++,
          };
          byNorm.set(norm, acc);
        } else {
          acc.label = preferDisplayLabel(acc.label, rawLabel);
          if (style && !acc.style) acc.style = style;
          const longerNorm =
            normalizeNoteBreakdownLabel(acc.label).length >= norm.length
              ? normalizeNoteBreakdownLabel(acc.label)
              : norm;
          if (longerNorm !== norm && !byNorm.has(longerNorm)) {
            byNorm.set(longerNorm, acc);
          }
        }
        // Prefer first non-null value if a later segment/year already filled it.
        if (acc.values[year] == null) {
          acc.values[year] = parseNoteAmount(row.cells?.[yearCol]);
        }
      }
    }
  }

  const unique: Acc[] = [];
  const seenAcc = new Set<Acc>();
  for (const acc of byNorm.values()) {
    if (seenAcc.has(acc)) continue;
    seenAcc.add(acc);
    unique.push(acc);
  }

  const filledCount = (acc: Acc) =>
    yearsWithTables.filter((year) => acc.values[year] != null).length;
  const isComplete = (acc: Acc) =>
    yearsWithTables.length > 0 && filledCount(acc) === yearsWithTables.length;

  const complete = unique.filter(isComplete);
  const partial = unique.filter((acc) => !isComplete(acc));
  const bySourceOrder = (a: Acc, b: Acc) => a.order - b.order;
  complete.sort((a, b) => {
    const aTot = isTotalLike(a.label, a.style);
    const bTot = isTotalLike(b.label, b.style);
    if (aTot !== bTot) return aTot ? 1 : -1;
    return bySourceOrder(a, b);
  });
  partial.sort((a, b) => {
    const diff = filledCount(b) - filledCount(a);
    if (diff !== 0) return diff;
    return bySourceOrder(a, b);
  });

  const ordered: Acc[] = [...complete];
  if (partial.length) {
    ordered.push({
      label: "Reported in some years only",
      style: "section",
      values: {},
      order: orderCounter,
    });
    ordered.push(...partial);
  }

  return ordered.map(({ label, style, values }) => ({ label, style, values }));
}

function isGroupLabel(value: string | undefined | null): boolean {
  return normalizeHeaderCell(value) === "GROUP";
}

function isBankLabel(value: string | undefined | null): boolean {
  const text = normalizeHeaderCell(value);
  return text === "BANK" || text === "COMPANY";
}

function bankDisplayLabel(value: string | undefined | null): string {
  const text = normalizeHeaderCell(value);
  if (text === "COMPANY") return "Company";
  return "Bank";
}

function projectCells(cells: string[], indices: number[]): string[] {
  return indices.map((index) => cells[index] ?? "");
}

function projectTable(
  table: NoteExtractedTable,
  indices: number[],
  entityCaption: string,
): NoteExtractedTable {
  return {
    ...table,
    caption: table.caption
      ? `${table.caption} · ${entityCaption}`
      : entityCaption,
    header_rows: (table.header_rows || []).map((row) =>
      projectCells(row, indices),
    ),
    rows: (table.rows || []).map((row) => ({
      ...row,
      cells: projectCells(row.cells || [], indices),
    })),
  };
}

/** Split a combined GROUP+BANK note table into two projected tables. */
export function splitGroupBankTable(
  table: NoteExtractedTable,
): SplitNoteTables | null {
  const headerRows = table.header_rows || [];
  if (headerRows.length === 0) return null;

  let groupIndex = -1;
  let bankIndex = -1;
  let bankRaw = "";

  for (const row of headerRows) {
    for (let i = 0; i < row.length; i += 1) {
      if (groupIndex < 0 && isGroupLabel(row[i])) groupIndex = i;
      if (bankIndex < 0 && isBankLabel(row[i])) {
        bankIndex = i;
        bankRaw = row[i] ?? "BANK";
      }
    }
    if (groupIndex >= 0 && bankIndex >= 0) break;
  }

  if (groupIndex < 0 || bankIndex < 0 || bankIndex <= groupIndex) {
    return null;
  }

  const width = Math.max(
    1,
    ...headerRows.map((row) => row.length),
    ...(table.rows || []).map((row) => row.cells?.length ?? 0),
  );

  const labelIndices = Array.from({ length: groupIndex }, (_, i) => i);
  const groupValueIndices = Array.from(
    { length: bankIndex - groupIndex },
    (_, i) => groupIndex + i,
  );
  const bankValueIndices = Array.from(
    { length: width - bankIndex },
    (_, i) => bankIndex + i,
  );

  if (groupValueIndices.length === 0 || bankValueIndices.length === 0) {
    return null;
  }

  const bankLabel = bankDisplayLabel(bankRaw);

  return {
    group: projectTable(
      table,
      [...labelIndices, ...groupValueIndices],
      "Group",
    ),
    bank: projectTable(
      table,
      [...labelIndices, ...bankValueIndices],
      bankLabel,
    ),
    bankLabel,
  };
}

function NoteTableGrid({
  table,
  fitContent = false,
}: {
  table: NoteExtractedTable;
  fitContent?: boolean;
}) {
  const columnCount = Math.max(
    1,
    ...table.header_rows.map((row) => row.length),
    ...table.rows.map((row) => row.cells.length),
  );

  const headerJoined = (table.header_rows || [])
    .map((row) => normalizeHeaderCell(row[1]))
    .join(" ");
  const hasNoteColumn = headerJoined.includes("NOTE");
  const cellPad = fitContent ? "px-2 py-1" : "px-2.5 py-1.5";
  const headerPad = fitContent ? "px-2 py-1.5" : "px-2.5 py-2";
  const labelMin = fitContent ? "min-w-[160px] max-w-[220px]" : "min-w-[200px] max-w-[280px]";
  const noteMin = fitContent ? "min-w-[3.5rem] max-w-[5.5rem]" : "min-w-[4.5rem] max-w-[7rem]";
  const valueMin = fitContent ? "min-w-[4.5rem]" : "min-w-[5.5rem]";

  return (
    <div
      className={cn(
        fitContent
          ? "w-max"
          : "w-full max-w-full overflow-x-auto overscroll-x-contain",
      )}
    >
      <table
        className={cn(
          "border-collapse text-xs tabular-nums",
          fitContent ? "w-max" : "w-max max-w-full",
        )}
      >
        {table.header_rows.length > 0 ? (
          <thead>
            {table.header_rows.map((row, rowIndex) => (
              <tr key={`header-${rowIndex}`}>
                {Array.from({ length: columnCount }, (_, cellIndex) => {
                  const cellText = row[cellIndex] ?? "";
                  const isLabel = cellIndex === 0;
                  const isNote = hasNoteColumn && cellIndex === 1;
                  return (
                    <th
                      key={cellIndex}
                      className={cn(
                        "border-b border-r border-border/60 font-semibold whitespace-pre-line last:border-r-0",
                        headerPad,
                        headerCellTone(cellText),
                        isLabel
                          ? cn(labelMin, "text-left")
                          : isNote
                            ? cn(noteMin, "text-left")
                            : cn(valueMin, "whitespace-nowrap text-right"),
                      )}
                    >
                      {cellText}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
        ) : null}
        <tbody>
          {table.rows.map((row, rowIndex) => {
            const styleClass = rowStyleClass(row.style);
            if (styleClass === "h-5" && fitContent) {
              return <tr key={`row-${rowIndex}`} className="h-2" />;
            }
            return (
              <tr
                key={`row-${rowIndex}`}
                className={cn(
                  "transition-colors hover:bg-amber-500/[0.06]",
                  !styleClass && "even:bg-muted/25",
                  styleClass === "h-5" ? "h-5" : styleClass,
                )}
              >
                {Array.from({ length: columnCount }, (_, cellIndex) => {
                  const isLabel = cellIndex === 0;
                  const isNote = hasNoteColumn && cellIndex === 1;
                  return (
                    <td
                      key={cellIndex}
                      className={cn(
                        "border-b border-r border-border/50 last:border-r-0",
                        cellPad,
                        isLabel
                          ? cn(
                              labelMin,
                              "text-left font-sans whitespace-pre-line text-foreground/95",
                            )
                          : isNote
                            ? cn(
                                noteMin,
                                "text-left font-sans whitespace-pre-line text-muted-foreground",
                              )
                            : cn(
                                valueMin,
                                "text-right font-mono whitespace-nowrap text-foreground/90",
                              ),
                    )}
                    >
                      {row.cells[cellIndex] ?? ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupBankSwipeTable({
  caption,
  split,
  className,
  yearLabel,
  fitContent = false,
}: {
  caption: string;
  split: SplitNoteTables;
  className?: string;
  yearLabel?: string;
  fitContent?: boolean;
}) {
  const [panel, setPanel] = React.useState<EntityPanel>("group");
  const trackRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    moved: boolean;
  } | null>(null);

  const showBank = panel === "bank";

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - state.startX) > 28) {
      state.moved = true;
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (!state.moved) return;
    const dx = event.clientX - state.startX;
    if (dx <= -48) setPanel("bank");
    else if (dx >= 48) setPanel("group");
  };

  return (
    <section
      data-no-pan
      data-note-table-card
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm ring-1 ring-amber-500/10",
        fitContent ? "w-max" : "w-max max-w-full",
        className,
      )}
    >
      <div className="flex shrink-0 flex-nowrap items-center justify-between gap-2 border-b border-amber-500/15 bg-gradient-to-r from-amber-500/10 via-muted/40 to-muted/20 px-2.5 py-1.5">
        <h4 className="min-w-0 truncate text-xs font-semibold tracking-tight sm:text-sm">
          {caption}
        </h4>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="inline-flex rounded-md border border-border/80 bg-background/80 p-0.5 text-xs shadow-sm"
            role="tablist"
            aria-label="Group or Bank table"
          >
            <button
              type="button"
              role="tab"
              aria-selected={panel === "group"}
              onClick={() => setPanel("group")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                panel === "group"
                  ? "bg-teal-700 text-teal-50 shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Group
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panel === "bank"}
              onClick={() => setPanel("bank")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                panel === "bank"
                  ? "bg-teal-700 text-teal-50 shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {split.bankLabel}
            </button>
          </div>
          {yearLabel ? <YearBadge year={yearLabel} /> : null}
        </div>
      </div>

      <div
        ref={trackRef}
        className="touch-pan-y bg-background/40"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
      >
        <NoteTableGrid
          table={showBank ? split.bank : split.group}
          fitContent={fitContent}
        />
      </div>

      <div className="flex shrink-0 items-center justify-start gap-1.5 border-t border-border/60 bg-muted/20 px-2.5 py-1">
        <span
          className={cn(
            "size-1.5 rounded-full transition-colors",
            panel === "group" ? "bg-teal-500" : "bg-muted-foreground/35",
          )}
        />
        <span
          className={cn(
            "size-1.5 rounded-full transition-colors",
            panel === "bank" ? "bg-teal-500" : "bg-muted-foreground/35",
          )}
        />
        <span className="ml-1 text-[10px] text-muted-foreground">
          Swipe or tap to switch · showing{" "}
          {panel === "group" ? "Group" : split.bankLabel}
        </span>
      </div>
    </section>
  );
}

function SingleNoteTable({
  table,
  tableIndex,
  className,
  yearLabel,
  fitContent = false,
}: {
  table: NoteExtractedTable;
  tableIndex: number;
  className?: string;
  yearLabel?: string;
  fitContent?: boolean;
}) {
  return (
    <section
      data-no-pan
      data-note-table-card
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm ring-1 ring-amber-500/10",
        fitContent ? "w-max" : "w-max max-w-full",
        className,
      )}
    >
      <div className="flex shrink-0 flex-nowrap items-center justify-between gap-2 border-b border-amber-500/15 bg-gradient-to-r from-amber-500/10 via-muted/40 to-muted/20 px-2.5 py-1.5">
        <h4 className="min-w-0 truncate text-xs font-semibold tracking-tight sm:text-sm">
          {table.caption || `Note table ${tableIndex + 1}`}
        </h4>
        {yearLabel ? <YearBadge year={yearLabel} /> : null}
      </div>
      <div className="bg-background/40">
        <NoteTableGrid table={table} fitContent={fitContent} />
      </div>
    </section>
  );
}

export function ExtractedNoteTables({
  tables,
  className,
  yearLabel,
  fitContent = false,
}: ExtractedNoteTablesProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        fitContent ? "w-max" : "w-max max-w-full",
        className,
      )}
    >
      {tables.map((table, tableIndex) => {
        const split = splitGroupBankTable(table);
        const caption = table.caption || `Note table ${tableIndex + 1}`;

        if (split) {
          return (
            <GroupBankSwipeTable
              key={`${caption}-split-${tableIndex}`}
              caption={caption}
              split={split}
              yearLabel={yearLabel}
              fitContent={fitContent}
            />
          );
        }

        return (
          <SingleNoteTable
            key={`${caption}-${tableIndex}`}
            table={table}
            tableIndex={tableIndex}
            yearLabel={yearLabel}
            fitContent={fitContent}
          />
        );
      })}
    </div>
  );
}
