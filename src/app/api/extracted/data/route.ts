import { NextRequest, NextResponse } from "next/server";

import { fetchBackend } from "@/lib/backend-api";
import { isSafeSegment, readUtf8 } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Period = "Annual" | "Quarterly";

function normalizePeriod(raw: string | null): Period {
  if (!raw) return "Annual";
  const t = raw.trim().toLowerCase();
  if (t === "quarterly" || t === "quarter" || t === "interim" || t === "q") {
    return "Quarterly";
  }
  return "Annual";
}

async function dataFromMongo(
  company: string,
  year: string,
  period: Period,
  quarter?: string | null,
): Promise<NextResponse | null> {
  try {
    const qs = new URLSearchParams({
      company,
      year,
      period,
    });
    if (quarter) qs.set("quarter", quarter);
    const res = await fetchBackend(`/extracted/data?${qs.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    return NextResponse.json(json);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");
  const period = normalizePeriod(searchParams.get("period"));
  const yearParam = searchParams.get("year");
  const quarterParam = searchParams.get("quarter");

  if (!company) {
    return NextResponse.json(
      { error: "Missing required query param: company" },
      { status: 400 },
    );
  }

  if (!isSafeSegment(company)) {
    return NextResponse.json(
      { error: "Invalid company segment" },
      { status: 400 },
    );
  }

  if (yearParam && /^\d{4}$/.test(yearParam)) {
    const mongoResponse = await dataFromMongo(
      company,
      yearParam,
      period,
      quarterParam,
    );
    if (mongoResponse) return mongoResponse;
  }

  const resultsFile =
    period === "Quarterly"
      ? `${company}_quarterly_results.json`
      : `${company}_results.json`;

  const metaFile =
    period === "Quarterly"
      ? "extraction_meta_quarterly.json"
      : "extraction_meta.json";

  let raw: string;
  try {
    raw = await readUtf8("testing", company, resultsFile);
  } catch {
    return NextResponse.json(
      { error: "Extracted results not found", company, period },
      { status: 404 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to parse results JSON",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  // The Quarterly results file produced by Q_data_extraction has the shape
  //   { ..., statements: { <key>: { status, title, data } }, local_statements: {...} }
  // The Annual results file produced by Data_retrive is already
  //   { <key>: { status, title, data } }
  // The frontend's `statementsFromResults` expects the Annual shape, so
  // unwrap the Quarterly file's `statements` field here.
  let results: unknown = parsed;
  if (
    period === "Quarterly" &&
    parsed &&
    typeof parsed === "object" &&
    "statements" in (parsed as Record<string, unknown>)
  ) {
    const stmts = (parsed as { statements?: unknown }).statements;
    if (stmts && typeof stmts === "object") {
      results = stmts;
    }
  }

  let meta: unknown = null;
  try {
    const rawMeta = await readUtf8("testing", company, metaFile);
    meta = JSON.parse(rawMeta);
  } catch {
    meta = null;
  }

  return NextResponse.json({
    company,
    period,
    meta,
    results,
  });
}
