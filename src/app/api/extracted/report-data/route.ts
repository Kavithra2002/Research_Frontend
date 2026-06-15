import { NextRequest, NextResponse } from "next/server";

import { fetchBackend } from "@/lib/backend-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");
  const reportKey = searchParams.get("reportKey");
  const reportType = searchParams.get("reportType") ?? "annual";

  if (!company || !reportKey) {
    return NextResponse.json(
      { error: "Missing required query param(s): company, reportKey" },
      { status: 400 },
    );
  }

  try {
    const qs = new URLSearchParams({ company, reportKey, reportType });
    const res = await fetchBackend(`/extracted/report-data?${qs.toString()}`);
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
