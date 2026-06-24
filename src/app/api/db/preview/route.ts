import { NextRequest, NextResponse } from "next/server";

import { fetchBackend } from "@/lib/backend-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");
  const view = searchParams.get("view") ?? "fs";

  try {
    const qs = new URLSearchParams({ view });
    if (company?.trim()) qs.set("company", company.trim());
    const res = await fetchBackend(`/db/preview?${qs.toString()}`);
    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
