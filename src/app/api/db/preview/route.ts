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
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const body = await res.text();
      const snippet = body.slice(0, 120).replace(/\s+/g, " ");
      return NextResponse.json(
        {
          error: `Backend /db/preview returned non-JSON (${res.status}). ${snippet}`,
        },
        { status: 502 },
      );
    }
    const json = await res.json();
    // Never pass 404 through — App Router may replace JSON 404 with the HTML
    // not-found page, which the DB UI then fails to parse.
    const status = res.status === 404 ? 502 : res.status;
    return NextResponse.json(json, { status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
