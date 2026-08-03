import { NextResponse } from "next/server";
import { fetchBackend } from "@/lib/backend-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetchBackend("/cse/companies");
    const data = (await res.json()) as {
      companies?: { name: string; symbol: string; displayName?: string }[];
      source?: string;
      syncedAt?: string | null;
      stale?: boolean;
      error?: string;
    };
    if (!res.ok) {
      return NextResponse.json(
        {
          error: data.error ?? "Failed to list CSE companies",
          companies: [],
        },
        { status: res.status },
      );
    }
    return NextResponse.json({
      companies: (data.companies ?? []).map((c) => ({
        name: c.name,
        symbol: c.symbol,
        displayName: c.displayName ?? c.name,
      })),
      source: data.source,
      syncedAt: data.syncedAt,
      stale: data.stale,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        companies: [],
      },
      { status: 502 },
    );
  }
}
