import { NextRequest, NextResponse } from "next/server";

import { fetchBackend } from "@/lib/backend-api";
import { isSafeSegment } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");
  const statement =
    searchParams.get("statement") ??
    searchParams.get("statementKey") ??
    "income_statement";
  const period = searchParams.get("period") ?? "Annual";
  const from = searchParams.get("from") ?? "2017";
  const to = searchParams.get("to") ?? "2025";

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

  try {
    const qs = new URLSearchParams({
      company,
      statement,
      period,
      from,
      to,
    });
    const res = await fetchBackend(`/extracted/yearly-summary?${qs.toString()}`);
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(json, { status: res.status });
    }
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load yearly summary",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
