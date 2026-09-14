import { NextResponse } from "next/server";

import { hydrateWarmupSnapshot } from "@/lib/warmup-data";
import { readWarmupSnapshotFile } from "@/lib/warmup-snapshot.server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readWarmupSnapshotFile());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { payloads?: Record<string, unknown> };
    if (body?.payloads && typeof body.payloads === "object") {
      hydrateWarmupSnapshot(body.payloads);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
