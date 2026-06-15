import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CSE_BASE = "https://www.cse.lk/api";

// Whitelist of endpoints that this proxy is allowed to forward.
// Keeps the route safe and predictable.
const ALLOWED_ENDPOINTS = new Set([
  "companyInfoSummery",
  "tradeSummary",
  "todaySharePrice",
  "topGainers",
  "topLooses",
  "mostActiveTrades",
  "getNewListingsRelatedNoticesAnnouncements",
  "getBuyInBoardAnnouncements",
  "approvedAnnouncement",
  "getCOVIDAnnouncements",
  "getFinancialAnnouncement",
  "circularAnnouncement",
  "directiveAnnouncement",
  "getNonComplianceAnnouncements",
  "marketStatus",
  "marketSummery",
  "aspiData",
  "snpData",
  "chartData",
  "allSectors",
  "detailedTrades",
  "dailyMarketSummery",
  "companyChartDataByStock",
]);

// Parameters that are commonly accepted by CSE endpoints. We forward any of
// these that are present on the incoming request (query string or JSON body).
const FORWARDABLE_PARAMS = ["symbol", "stockId", "chartId", "period"] as const;

async function callCSE(
  endpoint: string,
  params: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    form.set(key, value);
  }

  const res = await fetch(`${CSE_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (compatible; AmbeonConsole/1.0; +https://www.cse.lk)",
    },
    body: form.toString(),
    // CSE data is real-time; never cache the response at fetch layer.
    cache: "no-store",
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Some endpoints (e.g. chartData with a bad symbol) return HTML 400 pages.
    body = { raw: text };
  }

  return { status: res.status, body };
}

function collectParams(
  req: NextRequest,
  jsonBody: Record<string, unknown> | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  const url = new URL(req.url);

  for (const key of FORWARDABLE_PARAMS) {
    const fromQuery = url.searchParams.get(key);
    if (fromQuery) {
      out[key] = fromQuery;
      continue;
    }
    const fromBody = jsonBody?.[key];
    if (typeof fromBody === "string" || typeof fromBody === "number") {
      out[key] = String(fromBody);
    }
  }

  return out;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ endpoint: string }> },
) {
  const { endpoint } = await params;
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return NextResponse.json(
      { error: `Endpoint not allowed: ${endpoint}` },
      { status: 400 },
    );
  }

  try {
    const forwarded = collectParams(req, null);
    const { status, body } = await callCSE(endpoint, forwarded);
    return NextResponse.json(body, { status });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to reach Colombo Stock Exchange",
        endpoint,
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ endpoint: string }> },
) {
  const { endpoint } = await params;
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return NextResponse.json(
      { error: `Endpoint not allowed: ${endpoint}` },
      { status: 400 },
    );
  }

  let json: Record<string, unknown> | null = null;
  try {
    json = (await req.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }

  try {
    const forwarded = collectParams(req, json);
    const { status, body } = await callCSE(endpoint, forwarded);
    return NextResponse.json(body, { status });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to reach Colombo Stock Exchange",
        endpoint,
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }
}
