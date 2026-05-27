import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CseCompany = {
  name: string;
  symbol: string;
};

type CacheEntry = {
  companies: CseCompany[];
  fetchedAt: number;
};

const CSE_ORIGIN = "https://www.cse.lk";
const CSE_API = `${CSE_ORIGIN}/api`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

const g = globalThis as unknown as { __cseCompaniesCache?: CacheEntry };

async function fetchTradeSummary(): Promise<CseCompany[]> {
  const res = await fetch(`${CSE_API}/tradeSummary`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Origin: CSE_ORIGIN,
      Referer: `${CSE_ORIGIN}/`,
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
    },
    body: "",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`CSE tradeSummary returned ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const rows =
    (data.reqTradeSummery as unknown[]) ??
    (data.reqTradeSummary as unknown[]) ??
    [];

  if (!Array.isArray(rows)) return [];

  const seen = new Set<string>();
  const out: CseCompany[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const symbol = typeof r.symbol === "string" ? r.symbol.trim() : "";
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!symbol || !name || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({ name, symbol });
  }

  out.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return out;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("refresh") === "1";

  const now = Date.now();
  const cached = g.__cseCompaniesCache;
  if (!force && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({
      companies: cached.companies,
      cached: true,
      fetchedAt: new Date(cached.fetchedAt).toISOString(),
    });
  }

  try {
    const companies = await fetchTradeSummary();
    g.__cseCompaniesCache = { companies, fetchedAt: now };
    return NextResponse.json({
      companies,
      cached: false,
      fetchedAt: new Date(now).toISOString(),
    });
  } catch (e) {
    if (cached) {
      return NextResponse.json({
        companies: cached.companies,
        cached: true,
        stale: true,
        fetchedAt: new Date(cached.fetchedAt).toISOString(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return NextResponse.json(
      {
        companies: [],
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }
}
