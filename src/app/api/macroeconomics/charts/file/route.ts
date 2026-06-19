import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getMacReportsRoot(): string {
  const scriptRoot =
    process.env.SCRIPT_ROOT?.trim() ||
    path.resolve(process.cwd(), "..", "backend");
  const fromEnv = process.env.MAC_REPORTS_DIR?.trim();
  return fromEnv ? path.resolve(fromEnv) : path.join(scriptRoot, "MaC Reports");
}

function isSafeSegment(segment: string): boolean {
  if (!segment) return false;
  if (segment.includes("\0")) return false;
  if (segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\")) return false;
  return true;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");
  const file = searchParams.get("file");
  const download = searchParams.get("download") === "1";

  if (!year || !file) {
    return NextResponse.json(
      { error: "Missing required query params: year, file" },
      { status: 400 },
    );
  }

  if (![year, file].every(isSafeSegment)) {
    return NextResponse.json({ error: "Invalid path segment" }, { status: 400 });
  }

  if (!/^\d{4}$/.test(year)) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const ext = path.extname(file).toLowerCase();
  if (ext !== ".pdf") {
    return NextResponse.json(
      { error: "Only .pdf files are served" },
      { status: 400 },
    );
  }

  const root = getMacReportsRoot();
  const full = path.resolve(root, year, file);
  if (!full.startsWith(path.resolve(root) + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  let stat;
  try {
    stat = await fs.stat(full);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  let body: Buffer;
  try {
    body = await fs.readFile(full);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const disposition = download
    ? `attachment; filename="${encodeURIComponent(file)}"`
    : `inline; filename="${encodeURIComponent(file)}"`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(stat.size),
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=60",
    },
  });
}
