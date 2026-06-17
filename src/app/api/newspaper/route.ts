import { NextResponse } from "next/server";

import { fetchBackend } from "@/lib/backend-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const qs = category ? `?category=${encodeURIComponent(category)}` : "";
    const res = await fetchBackend(`/newspaper${qs}`);
    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Backend request failed (${res.status})`,
          featured: [],
          feed: [],
        },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        featured: [],
        feed: [],
      },
      { status: 502 },
    );
  }
}

export async function POST() {
  try {
    const res = await fetchBackend("/newspaper/refresh", { method: "POST" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend refresh failed (${res.status})` },
        { status: res.status },
      );
    }
    return NextResponse.json(await res.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
