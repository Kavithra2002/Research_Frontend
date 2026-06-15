import { NextResponse } from "next/server";

import { fetchBackend } from "@/lib/backend-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetchBackend("/extracted/stored-reports");
    if (!res.ok) {
      return NextResponse.json(
        { source: "mongodb", companies: [], error: `Backend returned ${res.status}` },
        { status: 200 },
      );
    }
    const json = await res.json();
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      {
        source: "mongodb",
        companies: [],
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 200 },
    );
  }
}
