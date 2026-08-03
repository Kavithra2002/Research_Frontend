import { NextResponse } from "next/server";
import { fetchBackend } from "@/lib/backend-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetchBackend("/cse/companies");
    const data = (await res.json()) as {
      companies?: { name: string; symbol: string }[];
      source?: string;
      syncedAt?: string | null;
      stale?: boolean;
      error?: string;
    };
    if (!res.ok) {
      return NextResponse.json(
        {
          companies: [],
          error: data.error ?? "Failed to list CSE companies",
        },
        { status: res.status },
      );
    }
    return NextResponse.json({
      companies: data.companies ?? [],
      source: data.source,
      syncedAt: data.syncedAt,
      stale: data.stale,
    });
  } catch (e) {
    return NextResponse.json(
      {
        companies: [],
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }
}
