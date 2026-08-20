"use client";

import * as React from "react";
import {
  AlertCircle,
  CalendarIcon,
  CheckCircle2,
  Loader2,
  MinusCircle,
  X,
} from "lucide-react";

import { FsSheetTableView } from "@/components/newspaper/fs-sheet-table-view";
import { NotesSheetTableView } from "@/components/newspaper/notes-sheet-table-view";
import { DateCompactSelect } from "@/components/newspaper/date-compact-select";
import {
  noteTablesHaveBankEntity,
  type NoteEntityPanel,
} from "@/components/newspaper/extracted-note-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { fetchApiJson } from "@/lib/fetch-api-json";
import { cn } from "@/lib/utils";
import {
  type DbAmountDisplay,
  type DbGridRow,
  type DbNotesPreview,
  type DbPreview,
  type DbQuarterlyPreview,
} from "@/lib/newspaper-db";

type DetailLevel = "summary" | "detailed";
type DataCategory = "financial" | "non_financial";
type StatementType = "income" | "balance" | "cfs" | "soce";
type PeriodType =
  | "annual"
  | "quarterly"
  | "Q1"
  | "Q2"
  | "Q3"
  | "Q4"
  | "6M"
  | "9M"
  | "TTM";

type NfMetric = {
  key: string;
  title: string;
  found: boolean;
  value: string;
  detail: string;
  pages: number[];
};
type NfCategory = { key: string; title: string; metrics: NfMetric[] };
type NfReport = {
  reportKey: string;
  year: number | null;
  reportingYear: string | null;
  foundCount: number;
  totalCount: number;
};
type NfCompany = { name: string; displayName: string; reports: NfReport[] };
type NfDataResponse = {
  companyOverview?: string;
  categories?: NfCategory[];
  error?: string;
};

const PERIOD_OPTIONS: { id: PeriodType; label: string }[] = [
  { id: "annual", label: "Annual" },
  { id: "quarterly", label: "Quarterly" },
  { id: "Q1", label: "Q1" },
  { id: "Q2", label: "Q2" },
  { id: "Q3", label: "Q3" },
  { id: "Q4", label: "Q4" },
  { id: "6M", label: "6M" },
  { id: "9M", label: "9M" },
  { id: "TTM", label: "TTM" },
];

const STATEMENT_OPTIONS: { id: StatementType; label: string; short: string }[] =
  [
    { id: "income", label: "Income statement", short: "IS" },
    { id: "balance", label: "Balance Sheet", short: "BS" },
    { id: "cfs", label: "CFS", short: "CFS" },
    { id: "soce", label: "SOCE", short: "SOCE" },
  ];

const STATEMENT_SECTION_MATCH: Record<
  Exclude<StatementType, "soce">,
  (label: string) => boolean
> = {
  income: (l) => {
    const u = l.toUpperCase();
    return u.includes("INCOME STATEMENT") || u === "OCI";
  },
  balance: (l) => l.toUpperCase().includes("BALANCE SHEET"),
  cfs: (l) =>
    l.toUpperCase().includes("CASH FLOW") ||
    l.toUpperCase().includes("CASHFLOWS"),
};

const QUARTER_MONTH: Record<"Q1" | "Q2" | "Q3" | "Q4", string> = {
  Q1: "Mar",
  Q2: "Jun",
  Q3: "Sep",
  Q4: "Dec",
};

function segmentBtn(active: boolean, disabled = false) {
  return cn(
    "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
    disabled
      ? "cursor-not-allowed opacity-45 text-muted-foreground"
      : active
        ? "bg-background text-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground",
  );
}

function parseColumnEndDate(label: string, key: string): Date | null {
  const keyMatch = key.match(/^(\d{4})-(\d{2})$/);
  if (keyMatch) {
    const year = Number(keyMatch[1]);
    const month = Number(keyMatch[2]);
    if (year && month >= 1 && month <= 12) return new Date(year, month, 0);
  }
  const qKey = key.match(/^q([1-4])_(\d{4})$/i);
  if (qKey) {
    const q = Number(qKey[1]);
    const year = Number(qKey[2]);
    const month = q * 3;
    return new Date(year, month, 0);
  }
  const labelMatch = label.match(
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i,
  );
  if (labelMatch) {
    const months: Record<string, number> = {
      jan: 1,
      feb: 2,
      mar: 3,
      apr: 4,
      may: 5,
      jun: 6,
      jul: 7,
      aug: 8,
      sep: 9,
      oct: 10,
      nov: 11,
      dec: 12,
    };
    const month = months[labelMatch[1].toLowerCase()];
    const year = Number(labelMatch[2]);
    if (month && year) return new Date(year, month, 0);
  }
  if (/^\d{4}$/.test(key) || /^\d{4}$/.test(label)) {
    const year = Number(/^\d{4}$/.test(key) ? key : label);
    return new Date(year, 11, 31);
  }
  return null;
}

function shiftMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function filterRowsByStatement(
  rows: DbGridRow[],
  statement: Exclude<StatementType, "soce">,
): DbGridRow[] {
  const match = STATEMENT_SECTION_MATCH[statement];
  const out: DbGridRow[] = [];
  let capturing = false;

  for (const row of rows) {
    if (row.kind === "section") {
      const isTarget = match(row.label);
      if (isTarget) {
        capturing = true;
        out.push(row);
        continue;
      }
      if (capturing) {
        // Income also keeps OCI as a following section
        if (statement === "income" && row.label.toUpperCase() === "OCI") {
          out.push(row);
          continue;
        }
        capturing = false;
      }
      continue;
    }
    if (capturing) out.push(row);
  }
  return out;
}

const MONTH_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];

function monthShort(month: number | null): string {
  if (month == null) return "";
  return MONTH_OPTIONS.find((m) => m.value === month)?.label ?? "";
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function dayOptions(year: number | null, month: number | null): number[] {
  if (year == null || month == null) return [];
  const count = daysInMonth(year, month);
  return Array.from({ length: count }, (_, i) => i + 1);
}

function clampDay(
  day: number | null,
  year: number | null,
  month: number | null,
): number | null {
  if (day == null || year == null || month == null) return null;
  return Math.min(day, daysInMonth(year, month));
}

function formatDatePart(
  year: number | null,
  month: number | null,
  day: number | null,
): string | null {
  if (year == null) return null;
  if (month != null && day != null) {
    return `${day} ${monthShort(month)} ${year}`;
  }
  if (month != null) return `${monthShort(month)} ${year}`;
  return String(year);
}

function formatYearRangeLabel(
  fromYear: number | null,
  toYear: number | null,
  fromMonth: number | null = null,
  toMonth: number | null = null,
  fromDay: number | null = null,
  toDay: number | null = null,
): string {
  if (fromYear == null && toYear == null) return "Year range";
  const fromPart = formatDatePart(fromYear, fromMonth, fromDay);
  const toPart = formatDatePart(toYear, toMonth, toDay);
  if (fromPart && toPart) {
    return fromPart === toPart ? fromPart : `${fromPart} – ${toPart}`;
  }
  return `${fromPart ?? toPart} – …`;
}

function filterColumns(args: {
  labels: string[];
  keys: string[];
  period: PeriodType;
  fromYear: number | null;
  toYear: number | null;
  fromMonth: number | null;
  toMonth: number | null;
  fromDay: number | null;
  toDay: number | null;
}): { labels: string[]; keys: string[] } {
  const {
    labels,
    keys,
    period,
    fromYear,
    toYear,
    fromMonth,
    toMonth,
    fromDay,
    toDay,
  } = args;
  let nextLabels = [...labels];
  let nextKeys = [...keys];

  if (period === "Q1" || period === "Q2" || period === "Q3" || period === "Q4") {
    const month = QUARTER_MONTH[period];
    const qNum = period.slice(1);
    const filtered: { label: string; key: string }[] = [];
    nextKeys.forEach((key, i) => {
      const label = nextLabels[i] ?? key;
      const matchLabel = label.toLowerCase().startsWith(month.toLowerCase());
      const matchKey =
        key.toLowerCase().startsWith(`q${qNum}_`) ||
        key
          .toLowerCase()
          .includes(`-${String(Number(qNum) * 3).padStart(2, "0")}`);
      if (matchLabel || matchKey) filtered.push({ label, key });
    });
    nextLabels = filtered.map((c) => c.label);
    nextKeys = filtered.map((c) => c.key);
  }

  if (period === "6M" || period === "9M" || period === "TTM") {
    const ends = nextKeys
      .map((key, i) => ({
        key,
        label: nextLabels[i] ?? key,
        end: parseColumnEndDate(nextLabels[i] ?? key, key),
      }))
      .filter((c) => c.end != null) as {
      key: string;
      label: string;
      end: Date;
    }[];
    ends.sort((a, b) => a.end.getTime() - b.end.getTime());
    if (ends.length > 0) {
      const end = ends[ends.length - 1].end;
      const months = period === "6M" ? 6 : period === "9M" ? 9 : 12;
      const start = shiftMonths(end, -(months - 1));
      start.setDate(1);
      const kept = ends.filter((c) => c.end >= start && c.end <= end);
      nextLabels = kept.map((c) => c.label);
      nextKeys = kept.map((c) => c.key);
    }
  }

  if (fromYear != null || toYear != null) {
    const from =
      fromYear != null
        ? new Date(
            fromYear,
            (fromMonth ?? 1) - 1,
            fromMonth != null ? (fromDay ?? 1) : 1,
          )
        : null;
    const toYearResolved = toYear ?? fromYear;
    let to: Date | null = null;
    if (toYearResolved != null) {
      if (toMonth != null) {
        const day =
          toDay ?? daysInMonth(toYearResolved, toMonth);
        to = new Date(toYearResolved, toMonth - 1, day, 23, 59, 59);
      } else {
        to = new Date(toYearResolved, 11, 31, 23, 59, 59);
      }
    }
    const filtered: { label: string; key: string }[] = [];
    nextKeys.forEach((key, i) => {
      const label = nextLabels[i] ?? key;
      const end = parseColumnEndDate(label, key);
      if (!end) {
        filtered.push({ label, key });
        return;
      }
      if (from && end < from) return;
      if (to && end > to) return;
      filtered.push({ label, key });
    });
    nextLabels = filtered.map((c) => c.label);
    nextKeys = filtered.map((c) => c.key);
  }

  return { labels: nextLabels, keys: nextKeys };
}

type DbTestViewProps = {
  company: string | null;
  companyDisplayName?: string;
  refreshToken?: number;
  className?: string;
};

export function DbTestView({
  company,
  companyDisplayName,
  refreshToken = 0,
  className,
}: DbTestViewProps) {
  const [detailLevel, setDetailLevel] = React.useState<DetailLevel>("summary");
  const [period, setPeriod] = React.useState<PeriodType>("annual");
  // null = full Annual Notes table; optional statement filters to a section
  const [statement, setStatement] = React.useState<StatementType | null>(null);
  const [dataCategory, setDataCategory] =
    React.useState<DataCategory>("financial");
  const [fromYear, setFromYear] = React.useState<number | null>(null);
  const [toYear, setToYear] = React.useState<number | null>(null);
  const [fromMonth, setFromMonth] = React.useState<number | null>(null);
  const [toMonth, setToMonth] = React.useState<number | null>(null);
  const [fromDay, setFromDay] = React.useState<number | null>(null);
  const [toDay, setToDay] = React.useState<number | null>(null);
  const [yearRangeOpen, setYearRangeOpen] = React.useState(false);
  const [amountDisplay, setAmountDisplay] =
    React.useState<DbAmountDisplay>("raw");
  const [noteEntity, setNoteEntity] = React.useState<NoteEntityPanel>("group");

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<DbPreview | null>(null);
  const [annualFallbackNote, setAnnualFallbackNote] = React.useState<
    string | null
  >(null);
  const [cachedBankMeta, setCachedBankMeta] = React.useState({
    available: false,
    bankLabel: "Bank",
  });

  const [nfLoading, setNfLoading] = React.useState(false);
  const [nfError, setNfError] = React.useState<string | null>(null);
  const [nfReports, setNfReports] = React.useState<NfReport[]>([]);
  const [nfReportKey, setNfReportKey] = React.useState<string | null>(null);
  const [nfData, setNfData] = React.useState<NfDataResponse | null>(null);
  const [nfDataLoading, setNfDataLoading] = React.useState(false);
  const [showMissingNf, setShowMissingNf] = React.useState(false);

  const mountedRef = React.useRef(true);
  const previewRef = React.useRef(preview);
  previewRef.current = preview;
  const financialCacheKeyRef = React.useRef<string | null>(null);
  const nfDataCacheKeyRef = React.useRef<string | null>(null);
  const nfReportsCacheKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadFinancial = React.useCallback(async () => {
    if (!company) return;
    const cacheKey = `${company}::${period}::${refreshToken}`;
    // Reuse cached financial preview when toggling Data category back.
    if (previewRef.current && financialCacheKeyRef.current === cacheKey) {
      return;
    }
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
      setAnnualFallbackNote(null);
      // Keep previous preview so filters stay mounted; table shows overlay.
    }

    try {
      // Annual: Notes view for every company (stable description rows +
      // expandable note tables). Statement filtering is client-side.
      if (period === "annual") {
        const qs = new URLSearchParams({
          view: "notes",
          company,
        });
        const json = await fetchApiJson<DbPreview>(`/api/db/preview?${qs}`);
        if (!mountedRef.current) return;
        setPreview(json);
        financialCacheKeyRef.current = cacheKey;
        return;
      }

      // Quarterly / Q1–Q4 / 6M / 9M / TTM
      const qs = new URLSearchParams({ view: "quarterly", company });
      const json = await fetchApiJson<DbPreview>(`/api/db/preview?${qs}`);
      if (!mountedRef.current) return;
      setPreview(json);
      financialCacheKeyRef.current = cacheKey;
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setPreview(null);
      financialCacheKeyRef.current = null;
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [company, period, refreshToken]);

  React.useEffect(() => {
    if (period !== "annual" && detailLevel !== "summary") {
      setDetailLevel("summary");
    }
  }, [period, detailLevel]);

  React.useEffect(() => {
    if (dataCategory !== "financial") return;
    void loadFinancial();
  }, [dataCategory, loadFinancial]);

  React.useEffect(() => {
    if (!company) {
      setNfReports([]);
      setNfReportKey(null);
      setNfData(null);
      nfDataCacheKeyRef.current = null;
      nfReportsCacheKeyRef.current = null;
      return;
    }

    const reportsKey = `${company}::${refreshToken}`;
    if (
      nfReportsCacheKeyRef.current &&
      nfReportsCacheKeyRef.current !== reportsKey
    ) {
      // Company/refresh changed — drop stale NF payload.
      setNfData(null);
      nfDataCacheKeyRef.current = null;
      setNfReports([]);
      nfReportsCacheKeyRef.current = null;
    }

    // Keep NF cache when switching to Financial so toggles stay instant.
    if (dataCategory !== "non_financial") return;
    if (nfReportsCacheKeyRef.current === reportsKey) return;

    let cancelled = false;
    setNfLoading(true);
    setNfError(null);
    fetch("/api/extracted/non-financial", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as {
          companies?: NfCompany[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
        return json.companies ?? [];
      })
      .then((companies) => {
        if (cancelled) return;
        const match =
          companies.find((c) => c.name === company) ??
          companies.find(
            (c) =>
              c.displayName.toLowerCase() ===
              (companyDisplayName ?? "").toLowerCase(),
          );
        const reports = match?.reports ?? [];
        setNfReports(reports);
        nfReportsCacheKeyRef.current = reportsKey;
        setNfReportKey((prev) => {
          if (prev && reports.some((r) => r.reportKey === prev)) return prev;
          return reports[0]?.reportKey ?? null;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setNfError(err instanceof Error ? err.message : String(err));
        setNfReports([]);
        setNfReportKey(null);
        nfReportsCacheKeyRef.current = null;
      })
      .finally(() => {
        if (!cancelled) setNfLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company, companyDisplayName, dataCategory, refreshToken]);

  React.useEffect(() => {
    if (!company) {
      setNfData(null);
      nfDataCacheKeyRef.current = null;
      return;
    }
    // Keep NF content cached while viewing Financial Data.
    if (dataCategory !== "non_financial" || !nfReportKey) return;

    const cacheKey = `${company}::${nfReportKey}::${refreshToken}`;
    if (nfDataCacheKeyRef.current === cacheKey) return;

    let cancelled = false;
    setNfDataLoading(true);
    const qs = new URLSearchParams({ company, reportKey: nfReportKey });
    fetch(`/api/extracted/non-financial-data?${qs}`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as NfDataResponse;
        if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
        return json;
      })
      .then((json) => {
        if (cancelled) return;
        setNfData(json);
        nfDataCacheKeyRef.current = cacheKey;
      })
      .catch((err) => {
        if (cancelled) return;
        setNfError(err instanceof Error ? err.message : String(err));
        setNfData(null);
        nfDataCacheKeyRef.current = null;
      })
      .finally(() => {
        if (!cancelled) setNfDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [company, dataCategory, nfReportKey, refreshToken]);

  const rawColumnLabels =
    preview?.view === "quarterly"
      ? (preview as DbQuarterlyPreview).columns.map((c) => c.label)
      : preview && "years" in preview
        ? preview.years.map(String)
        : [];
  const rawColumnKeys =
    preview?.view === "quarterly"
      ? (preview as DbQuarterlyPreview).columns.map((c) => c.key)
      : preview && "years" in preview
        ? preview.years.map(String)
        : [];

  // Keep Entity / Statement controls stable even while preview is loading /
  // while Non Financial Data is selected (panel stays mounted for height anim).
  const isAnnualNotesContext =
    period === "annual" && statement !== "soce";

  const isAnnualNotesView =
    isAnnualNotesContext && preview?.view === "notes";

  const filteredColumns = React.useMemo(
    () =>
      filterColumns({
        labels: rawColumnLabels,
        keys: rawColumnKeys,
        period,
        fromYear,
        toYear,
        fromMonth,
        toMonth,
        fromDay,
        toDay,
      }),
    [
      fromDay,
      fromMonth,
      fromYear,
      period,
      rawColumnKeys,
      rawColumnLabels,
      toDay,
      toMonth,
      toYear,
    ],
  );

  const notesYears = React.useMemo(() => {
    if (!isAnnualNotesView) return [];
    const keys = filteredColumns.keys.length
      ? filteredColumns.keys
      : rawColumnKeys;
    return keys.map((k) => Number(k)).filter((y) => Number.isFinite(y));
  }, [filteredColumns.keys, isAnnualNotesView, rawColumnKeys]);

  const tableRows = React.useMemo(() => {
    if (statement === "soce") return [];
    const rows = preview?.rows ?? [];
    if (!rows.length) return [];
    const canFilterStatement =
      Boolean(statement) &&
      (isAnnualNotesView ||
        preview?.view === "fs" ||
        preview?.view === "quarterly");
    if (canFilterStatement && statement && statement !== "soce") {
      return filterRowsByStatement(rows, statement);
    }
    return rows;
  }, [isAnnualNotesView, preview?.rows, preview?.view, statement]);

  // Derive Entity availability from the full Notes sheet, not the filtered
  // statement section — otherwise Group/Bank vanishes when switching statements.
  const noteBankMeta = React.useMemo(() => {
    if (preview?.view !== "notes") {
      return { available: false, bankLabel: "Bank" as string };
    }
    const rows = preview.rows ?? [];
    for (const row of rows) {
      const meta = noteTablesHaveBankEntity(row.note_tables_by_year);
      if (meta.available) return meta;
    }
    const hasBankValues = rows.some((row) =>
      Object.values(row.values_bank ?? {}).some((v) => v != null),
    );
    if (hasBankValues) {
      return { available: true, bankLabel: "Bank" as string };
    }
    return { available: false, bankLabel: "Bank" as string };
  }, [preview]);

  React.useEffect(() => {
    if (noteBankMeta.available) {
      setCachedBankMeta(noteBankMeta);
    }
  }, [noteBankMeta]);

  const entityToggleMeta =
    noteBankMeta.available || !isAnnualNotesContext
      ? noteBankMeta
      : cachedBankMeta;

  const showEntityToggle =
    isAnnualNotesContext && entityToggleMeta.available;

  const periodLabel = preview?.period_label ?? "";
  const unit = preview?.unit ?? "";

  const statementTitle =
    STATEMENT_OPTIONS.find((s) => s.id === statement)?.label ??
    (period === "annual"
      ? "Notes"
      : period === "quarterly"
        ? "Quarterly"
        : period);
  const notesPreview =
    preview?.view === "notes" ? (preview as DbNotesPreview) : null;

  const viewControlsEnabled = period === "annual";
  const dateFilterActive =
    fromYear != null ||
    toYear != null ||
    fromMonth != null ||
    toMonth != null ||
    fromDay != null ||
    toDay != null;

  const availableYears = React.useMemo(() => {
    const years = rawColumnKeys
      .map((key) => Number(key.match(/^(\d{4})/)?.[1] ?? Number.NaN))
      .filter((year) => Number.isFinite(year));
    return [...new Set(years)].sort((a, b) => a - b);
  }, [rawColumnKeys]);

  const fromDayOptions = dayOptions(fromYear, fromMonth);
  const toDayOptions = dayOptions(toYear, toMonth);

  const clearYearRange = React.useCallback(() => {
    setFromYear(null);
    setToYear(null);
    setFromMonth(null);
    setToMonth(null);
    setFromDay(null);
    setToDay(null);
    setYearRangeOpen(false);
  }, []);

  const updateFromYear = React.useCallback((year: number | null) => {
    setFromYear(year);
    if (year == null) {
      setFromMonth(null);
      setFromDay(null);
    } else {
      setFromDay((d) => clampDay(d, year, fromMonth));
    }
    setToYear((currentTo) => {
      if (year == null || currentTo == null) return currentTo;
      return currentTo < year ? year : currentTo;
    });
  }, [fromMonth]);

  const updateToYear = React.useCallback((year: number | null) => {
    setToYear(year);
    if (year == null) {
      setToMonth(null);
      setToDay(null);
    } else {
      setToDay((d) => clampDay(d, year, toMonth));
    }
    setFromYear((currentFrom) => {
      if (year == null || currentFrom == null) return currentFrom;
      return currentFrom > year ? year : currentFrom;
    });
  }, [toMonth]);

  const updateFromMonth = React.useCallback((month: number | null) => {
    setFromMonth(month);
    if (month == null) {
      setFromDay(null);
    } else {
      setFromDay((d) => clampDay(d, fromYear, month));
    }
  }, [fromYear]);

  const updateToMonth = React.useCallback((month: number | null) => {
    setToMonth(month);
    if (month == null) {
      setToDay(null);
    } else {
      setToDay((d) => clampDay(d, toYear, month));
    }
  }, [toYear]);

  const selectStatement = React.useCallback((id: StatementType) => {
    // Toggle: click again to deselect and restore the full Annual table.
    setStatement((current) => (current === id ? null : id));
    // Statement sections are annual — switch Period when needed.
    setPeriod((current) => (current === "annual" ? current : "annual"));
  }, []);

  const selectPeriod = React.useCallback((id: PeriodType) => {
    setPeriod(id);
    // Annual shows the full table by default; statement filter is optional.
    // Non-annual periods also clear Statement so quarterly data can load.
    setStatement(null);
  }, []);

  return (
    <div className={cn("flex min-w-0 w-full flex-col gap-3", className)}>
      <div className="rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
                !viewControlsEnabled && "opacity-45",
              )}
            >
              View
            </span>
            <div
              className={cn(
                "inline-flex rounded-lg border bg-muted/40 p-0.5",
                !viewControlsEnabled && "opacity-60",
              )}
            >
              <button
                type="button"
                disabled={!viewControlsEnabled}
                className={segmentBtn(
                  detailLevel === "summary",
                  !viewControlsEnabled,
                )}
                onClick={() => {
                  if (viewControlsEnabled) setDetailLevel("summary");
                }}
                title={
                  viewControlsEnabled
                    ? "Notes summary — use the drop button to expand note tables"
                    : "Summary / Detailed only available for Annual period"
                }
              >
                Summary view
              </button>
              <button
                type="button"
                disabled={!viewControlsEnabled}
                className={segmentBtn(
                  detailLevel === "detailed",
                  !viewControlsEnabled,
                )}
                onClick={() => {
                  if (viewControlsEnabled) setDetailLevel("detailed");
                }}
                title={
                  viewControlsEnabled
                    ? "Fully expand all note line items"
                    : "Summary / Detailed only available for Annual period"
                }
              >
                Detailed view
              </button>
            </div>

            <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />

            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Data
            </span>
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
              <button
                type="button"
                className={segmentBtn(dataCategory === "financial")}
                onClick={() => setDataCategory("financial")}
              >
                Financial Data
              </button>
              <button
                type="button"
                className={segmentBtn(dataCategory === "non_financial")}
                onClick={() => setDataCategory("non_financial")}
              >
                Non Financial Data
              </button>
            </div>
          </div>

          <div>
            {/* Financial filters — animate height open/closed */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-in-out",
                dataCategory === "financial"
                  ? "grid-rows-[1fr]"
                  : "grid-rows-[0fr]",
              )}
              aria-hidden={dataCategory !== "financial"}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className={cn(
                    "flex flex-col gap-3 pt-3 transition-opacity duration-300 ease-in-out",
                    dataCategory === "financial"
                      ? "opacity-100"
                      : "pointer-events-none opacity-0",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Dates
                    </span>
                    <div className="flex items-center gap-1">
                      <Popover open={yearRangeOpen} onOpenChange={setYearRangeOpen}>
                        <PopoverTrigger
                          className={cn(
                            "inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium shadow-sm transition-colors",
                            "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                            dateFilterActive
                              ? "border-lime-500/40 text-foreground"
                              : "text-muted-foreground",
                          )}
                          aria-label="Filter by year range"
                          title="Filter columns by year range"
                          tabIndex={dataCategory === "financial" ? 0 : -1}
                        >
                          <CalendarIcon className="size-3.5 shrink-0" />
                          <span className="max-w-[14rem] truncate">
                            {formatYearRangeLabel(
                              fromYear,
                              toYear,
                              fromMonth,
                              toMonth,
                              fromDay,
                              toDay,
                            )}
                          </span>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-80 overflow-visible p-3"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  From
                                </span>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[10px] text-muted-foreground">
                                    Year
                                  </span>
                                  <DateCompactSelect
                                    value={fromYear}
                                    options={availableYears.map((year) => ({
                                      value: year,
                                      label: String(year),
                                    }))}
                                    onChange={updateFromYear}
                                    aria-label="From year"
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[10px] text-muted-foreground">
                                    Month
                                  </span>
                                  <DateCompactSelect
                                    value={fromMonth}
                                    options={MONTH_OPTIONS}
                                    disabled={fromYear == null}
                                    onChange={updateFromMonth}
                                    aria-label="From month"
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[10px] text-muted-foreground">
                                    Day
                                  </span>
                                  <DateCompactSelect
                                    value={fromDay}
                                    options={fromDayOptions.map((d) => ({
                                      value: d,
                                      label: String(d),
                                    }))}
                                    disabled={fromMonth == null}
                                    onChange={setFromDay}
                                    aria-label="From day"
                                  />
                                </label>
                              </div>
                              <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  To
                                </span>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[10px] text-muted-foreground">
                                    Year
                                  </span>
                                  <DateCompactSelect
                                    value={toYear}
                                    options={availableYears.map((year) => ({
                                      value: year,
                                      label: String(year),
                                    }))}
                                    onChange={updateToYear}
                                    aria-label="To year"
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[10px] text-muted-foreground">
                                    Month
                                  </span>
                                  <DateCompactSelect
                                    value={toMonth}
                                    options={MONTH_OPTIONS}
                                    disabled={toYear == null}
                                    onChange={updateToMonth}
                                    aria-label="To month"
                                  />
                                </label>
                                <label className="flex flex-col gap-1">
                                  <span className="text-[10px] text-muted-foreground">
                                    Day
                                  </span>
                                  <DateCompactSelect
                                    value={toDay}
                                    options={toDayOptions.map((d) => ({
                                      value: d,
                                      label: String(d),
                                    }))}
                                    disabled={toMonth == null}
                                    onChange={setToDay}
                                    aria-label="To day"
                                  />
                                </label>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] text-muted-foreground">
                                Pick year, then month, then day
                              </p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={!dateFilterActive}
                                onClick={clearYearRange}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                      {dateFilterActive ? (
                        <button
                          type="button"
                          onClick={clearYearRange}
                          className="inline-flex size-8 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          aria-label="Clear year range filter"
                          title="Show all years"
                          tabIndex={dataCategory === "financial" ? 0 : -1}
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Period
                    </span>
                    <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
                      {PERIOD_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={segmentBtn(period === opt.id)}
                          onClick={() => selectPeriod(opt.id)}
                          tabIndex={dataCategory === "financial" ? 0 : -1}
                          title={
                            opt.id === "annual"
                              ? "Full Annual table (statement filter optional)"
                              : "Clears Statement selection"
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Statement
                    </span>
                    <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
                      {STATEMENT_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          className={segmentBtn(statement === opt.id)}
                          onClick={() => selectStatement(opt.id)}
                          tabIndex={dataCategory === "financial" ? 0 : -1}
                          title={
                            opt.id === "soce"
                              ? "SOCE — under development"
                              : statement === opt.id
                                ? `Clear ${opt.label} filter (show full Annual table)`
                                : `${opt.label} — filter Annual table (click again to clear)`
                          }
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {showEntityToggle ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Entity
                      </span>
                      <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
                        <button
                          type="button"
                          className={segmentBtn(noteEntity === "group")}
                          onClick={() => setNoteEntity("group")}
                          tabIndex={dataCategory === "financial" ? 0 : -1}
                        >
                          Group
                        </button>
                        <button
                          type="button"
                          className={segmentBtn(noteEntity === "bank")}
                          onClick={() => setNoteEntity("bank")}
                          tabIndex={dataCategory === "financial" ? 0 : -1}
                        >
                          {entityToggleMeta.bankLabel}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Non-financial filters — animate height open/closed */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-in-out",
                dataCategory === "non_financial"
                  ? "grid-rows-[1fr]"
                  : "grid-rows-[0fr]",
              )}
              aria-hidden={dataCategory !== "non_financial"}
            >
              <div className="min-h-0 overflow-hidden">
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-2 pt-3 transition-opacity duration-300 ease-in-out",
                    dataCategory === "non_financial"
                      ? "opacity-100"
                      : "pointer-events-none opacity-0",
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Report
                  </span>
                  {nfLoading && nfReports.length === 0 ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading reports…
                    </span>
                  ) : nfReports.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      No saved non-financial reports for this company.
                    </span>
                  ) : (
                    <select
                      value={nfReportKey ?? ""}
                      onChange={(e) => setNfReportKey(e.target.value || null)}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      aria-label="Non-financial report"
                      tabIndex={dataCategory === "non_financial" ? 0 : -1}
                    >
                      {nfReports.map((r) => (
                        <option key={r.reportKey} value={r.reportKey}>
                          {r.reportingYear || r.year || r.reportKey}
                          {r.foundCount != null
                            ? ` · ${r.foundCount}/${r.totalCount}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {annualFallbackNote ? (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <AlertTitle className="text-sm">Period note</AlertTitle>
          <AlertDescription className="text-xs">
            {annualFallbackNote}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="relative min-w-0">
        {/* Financial content panel */}
        <div
          className={cn(
            "transition-opacity duration-300 ease-in-out",
            dataCategory === "financial"
              ? "relative z-[1] opacity-100"
              : "pointer-events-none absolute inset-x-0 top-0 z-0 opacity-0",
          )}
          aria-hidden={dataCategory !== "financial"}
        >
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load data</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : statement === "soce" ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/20 p-8 text-center">
              <p className="text-sm font-medium">SOCE — under development</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Statement of Changes in Equity will be added later. Use Income
                statement, Balance Sheet, or CFS for now.
              </p>
            </div>
          ) : (
            <div className="relative min-w-0">
              {isAnnualNotesView && tableRows.length > 0 && notesYears.length > 0 ? (
                <NotesSheetTableView
                  periodLabel={periodLabel}
                  unit={unit}
                  years={notesYears}
                  rows={tableRows}
                  amountDisplay={amountDisplay}
                  onAmountDisplayChange={setAmountDisplay}
                  companySlug={company ?? undefined}
                  detailLevel={detailLevel}
                  noteEntity={noteEntity}
                />
              ) : tableRows.length > 0 && filteredColumns.keys.length > 0 ? (
                <FsSheetTableView
                  pageScroll
                  title={statementTitle}
                  periodLabel={periodLabel}
                  unit={unit}
                  columnLabels={filteredColumns.labels}
                  columnKeys={filteredColumns.keys}
                  rows={tableRows}
                  valueFormat="amount"
                  enableNotes={false}
                  companySlug={company ?? undefined}
                  amountDisplay={amountDisplay}
                  onAmountDisplayChange={setAmountDisplay}
                  showAmountDisplaySelect
                />
              ) : !loading ? (
                <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                  {company
                    ? period !== "annual" &&
                      preview?.view === "quarterly" &&
                      !((preview as DbQuarterlyPreview).cells_filled)
                      ? "No quarterly figures are stored for this company yet. Run quarterly extraction (Test here), then Refresh."
                      : "No rows match the current filters. Try another period, statement, or date range."
                    : "Select a company to load data."}
                </div>
              ) : (
                <div className="min-h-[320px] rounded-xl border bg-card" />
              )}

              {loading ? (
                <div
                  className={cn(
                    "absolute inset-0 z-10 flex min-h-[320px] items-center justify-center rounded-xl",
                    tableRows.length > 0
                      ? "bg-background/70 backdrop-blur-[1px]"
                      : "bg-card",
                  )}
                  aria-busy="true"
                  aria-live="polite"
                >
                  <div className="flex items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 text-sm text-muted-foreground shadow-sm">
                    <Loader2 className="size-4 animate-spin" />
                    Loading {statementTitle}…
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Non-financial content panel */}
        <div
          className={cn(
            "transition-opacity duration-300 ease-in-out",
            dataCategory === "non_financial"
              ? "relative z-[1] opacity-100"
              : "pointer-events-none absolute inset-x-0 top-0 z-0 opacity-0",
          )}
          aria-hidden={dataCategory !== "non_financial"}
        >
          <div className="relative min-w-0">
            {nfError && !nfData ? (
              <Alert variant="destructive">
                <AlertTitle>Non-financial data unavailable</AlertTitle>
                <AlertDescription>{nfError}</AlertDescription>
              </Alert>
            ) : nfData ? (
              <div className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">Non-financial data</p>
                    <p className="text-xs text-muted-foreground">
                      {companyDisplayName || company}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => setShowMissingNf((s) => !s)}
                    tabIndex={dataCategory === "non_financial" ? 0 : -1}
                  >
                    {showMissingNf ? "Hide" : "Show"} not-found
                  </Button>
                </div>

                {nfData.companyOverview ? (
                  <div className="mb-4 rounded-lg border bg-muted/20 px-3 py-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Company overview
                    </span>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {nfData.companyOverview}
                    </p>
                  </div>
                ) : null}

                {(nfData.categories ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No categories stored for this report.
                  </p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {(nfData.categories ?? []).map((cat) => {
                      const metrics = Array.isArray(cat.metrics)
                        ? cat.metrics
                        : [];
                      const found = metrics.filter((m) => m.found);
                      const visible = showMissingNf ? metrics : found;
                      if (visible.length === 0) return null;
                      return (
                        <div key={cat.key} className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">
                              {cat.title}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {found.length}/{metrics.length}
                            </Badge>
                          </div>
                          <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                            {visible.map((m) => (
                              <li
                                key={m.key}
                                className={cn(
                                  "rounded-lg border px-3 py-2 text-xs shadow-sm",
                                  m.found
                                    ? "bg-card/60"
                                    : "border-dashed bg-muted/20 opacity-70",
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  {m.found ? (
                                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                                  ) : (
                                    <MinusCircle className="size-3.5 shrink-0 text-muted-foreground" />
                                  )}
                                  <span className="font-medium">{m.title}</span>
                                  {m.found && m.pages?.length > 0 ? (
                                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                                      p.{m.pages.join(", ")}
                                    </span>
                                  ) : null}
                                </div>
                                {m.found ? (
                                  <>
                                    <div className="mt-1 text-muted-foreground">
                                      {m.value}
                                    </div>
                                    {m.detail ? (
                                      <div className="mt-0.5 text-[11px] text-muted-foreground/80">
                                        {m.detail}
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <div className="mt-1 text-[11px] text-muted-foreground/70">
                                    Not reported
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : !(nfDataLoading || nfLoading) ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                <div className="flex max-w-sm flex-col items-center gap-2">
                  <AlertCircle className="size-5 text-muted-foreground/70" />
                  {company
                    ? "No non-financial data found for this company."
                    : "Select a company to load non-financial data."}
                </div>
              </div>
            ) : (
              <div className="min-h-[320px] rounded-xl border bg-card" />
            )}

            {(nfDataLoading || nfLoading) && dataCategory === "non_financial" ? (
              <div
                className={cn(
                  "absolute inset-0 z-10 flex min-h-[320px] items-center justify-center rounded-xl",
                  nfData
                    ? "bg-background/70 backdrop-blur-[1px]"
                    : "bg-card",
                )}
                aria-busy="true"
                aria-live="polite"
              >
                <div className="flex items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 text-sm text-muted-foreground shadow-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Loading non-financial data…
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
