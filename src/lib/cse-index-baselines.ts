import fs from "node:fs/promises";
import path from "node:path";

export type IndexDailySnapshot = {
  tradeDate: string;
  asi: number | null;
  spp: number | null;
  triasi: number | null;
  spt: number | null;
  dy: number | null;
};

export type YearBaseline = {
  tradeDate: string;
  asi: number | null;
  spp: number | null;
  triasi: number | null;
  spt: number | null;
};

type BaselineStore = {
  yearBaselines: Record<string, YearBaseline>;
  snapshots: IndexDailySnapshot[];
};

const STORE_PATH = path.join(
  process.cwd(),
  "data",
  "cse-index-baselines.json",
);

const MAX_SNAPSHOTS = 400;

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function dateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function yearFromDate(date: string): number {
  return Number(date.slice(0, 4));
}

function emptyStore(): BaselineStore {
  return { yearBaselines: {}, snapshots: [] };
}

export async function loadBaselineStore(): Promise<BaselineStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as BaselineStore;
    return {
      yearBaselines: parsed.yearBaselines ?? {},
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
    };
  } catch {
    return emptyStore();
  }
}

async function saveBaselineStore(store: BaselineStore): Promise<void> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function dailyRowToSnapshot(row: Record<string, unknown>): IndexDailySnapshot | null {
  const tradeDateMs = num(row.tradeDate);
  if (tradeDateMs == null) return null;
  return {
    tradeDate: dateKey(tradeDateMs),
    asi: num(row.asi),
    spp: num(row.spp),
    triasi: num(row.triasi),
    spt: num(row.spt),
    dy: num(row.dy),
  };
}

function upsertSnapshot(
  store: BaselineStore,
  snapshot: IndexDailySnapshot,
): void {
  const idx = store.snapshots.findIndex((s) => s.tradeDate === snapshot.tradeDate);
  if (idx >= 0) store.snapshots[idx] = snapshot;
  else store.snapshots.push(snapshot);

  store.snapshots.sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  if (store.snapshots.length > MAX_SNAPSHOTS) {
    store.snapshots = store.snapshots.slice(-MAX_SNAPSHOTS);
  }

  const y = String(yearFromDate(snapshot.tradeDate));
  const prev = store.yearBaselines[y];
  if (!prev || snapshot.tradeDate >= prev.tradeDate) {
    store.yearBaselines[y] = {
      tradeDate: snapshot.tradeDate,
      asi: snapshot.asi,
      spp: snapshot.spp,
      triasi: snapshot.triasi,
      spt: snapshot.spt,
    };
  }
}

export async function mergeDailySnapshots(
  rows: Record<string, unknown>[],
): Promise<BaselineStore> {
  const store = await loadBaselineStore();
  for (const row of rows) {
    const snap = dailyRowToSnapshot(row);
    if (snap) upsertSnapshot(store, snap);
  }
  await saveBaselineStore(store);
  return store;
}

export type YearReturns = {
  priceReturnYear: number | null;
  totalReturnYear: number | null;
  totalReturnAsOf: string | null;
  dividendYield: number | null;
};

export function computeCseYearReturns(opts: {
  isAspi: boolean;
  livePrice: number | null;
  latestDaily: IndexDailySnapshot | null;
  pricePrevYearEnd: number | null;
  store: BaselineStore;
}): YearReturns {
  const { isAspi, livePrice, latestDaily, pricePrevYearEnd, store } = opts;
  const year = new Date().getFullYear();
  const baseline = store.yearBaselines[String(year - 1)] ?? null;

  const priceBase =
    (isAspi ? baseline?.asi : baseline?.spp) ?? pricePrevYearEnd;
  let priceReturnYear: number | null = null;
  if (livePrice != null && priceBase != null && priceBase !== 0) {
    priceReturnYear = ((livePrice - priceBase) / priceBase) * 100;
  }

  const triNow = isAspi ? latestDaily?.triasi : latestDaily?.spt;
  const triBase = isAspi ? baseline?.triasi : baseline?.spt;
  let totalReturnYear: number | null = null;
  if (triNow != null && triBase != null && triBase !== 0) {
    totalReturnYear = ((triNow - triBase) / triBase) * 100;
  }

  return {
    priceReturnYear,
    totalReturnYear,
    totalReturnAsOf: latestDaily?.tradeDate ?? null,
    dividendYield: latestDaily?.dy ?? null,
  };
}
