import { NextRequest, NextResponse } from "next/server";
import path from "node:path";

import { isSafeSegment, readBytes, statFile } from "@/lib/storage";
import {
  normalizeCapturePeriod,
  resolveDemoCaptureCompanyDir,
  type CapturePeriod,
} from "@/lib/demo-captures";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function capturesFolderForPeriod(period: CapturePeriod): string {
  return period === "Quarterly" ? "captures_quarterly" : "captures";
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");
  const statement = searchParams.get("statement");
  const file = searchParams.get("file");
  const period = normalizeCapturePeriod(searchParams.get("period"));
  const yearParam = searchParams.get("year");
  const source = searchParams.get("source");

  if (!company || !statement || !file) {
    return NextResponse.json(
      { error: "Missing required query params: company, statement, file" },
      { status: 400 },
    );
  }

  if (![company, statement, file].every(isSafeSegment)) {
    return NextResponse.json(
      { error: "Invalid path segment" },
      { status: 400 },
    );
  }

  const ext = path.extname(file).toLowerCase();
  const contentType = MIME[ext];
  if (!contentType) {
    return NextResponse.json(
      { error: "Only image files are served" },
      { status: 400 },
    );
  }

  // Resolve the storage location.
  let root: "demo_captures" | "testing";
  let segments: string[];

  if (source === "demo" && yearParam && /^\d{4}$/.test(yearParam)) {
    const demoDir = await resolveDemoCaptureCompanyDir(company);
    if (!demoDir) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    root = "demo_captures";
    segments = [demoDir, period, yearParam, statement, file];
  } else {
    root = "testing";
    segments = [company, capturesFolderForPeriod(period), statement, file];
  }

  const stat = await statFile(root, ...segments);
  if (!stat) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  let body: Uint8Array;
  try {
    body = await readBytes(root, ...segments);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return new NextResponse(Buffer.from(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=300",
    },
  });
}
