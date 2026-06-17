import { NextResponse } from "next/server";

import { fetchBackend } from "@/lib/backend-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetchBackend(`/extracted/sector-lens-live`);
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend request failed (${res.status})`, rows: [] },
        { status: res.status },
      );
    }
    const json = await res.json();
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        rows: [],
      },
      { status: 502 },
    );
  }
}
