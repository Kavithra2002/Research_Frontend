import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getReportsRoot() {
  const fromEnv = process.env.REPORTS_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
  return path.resolve(process.cwd(), "..", "backend", "reports");
}

function isSafeSegment(segment: string) {
  if (!segment) return false;
  if (segment.includes("\0")) return false;
  if (segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\")) return false;
  return true;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");
  const type = searchParams.get("type");
  const file = searchParams.get("file");
  const download = searchParams.get("download") === "1";

  if (!company || !type || !file) {
    return NextResponse.json(
      { error: "Missing required query params: company, type, file" },
      { status: 400 },
    );
  }

  if (![company, type, file].every(isSafeSegment)) {
    return NextResponse.json(
      { error: "Invalid path segment" },
      { status: 400 },
    );
  }

  const ext = path.extname(file).toLowerCase();
  if (ext !== ".pdf") {
    return NextResponse.json(
      { error: "Only .pdf files are served" },
      { status: 400 },
    );
  }

  const reportsRoot = getReportsRoot();
  const fullPath = path.resolve(reportsRoot, company, type, file);

  if (!fullPath.startsWith(reportsRoot + path.sep) && fullPath !== reportsRoot) {
    return NextResponse.json(
      { error: "Path traversal detected" },
      { status: 400 },
    );
  }

  let stat;
  try {
    stat = await fs.stat(fullPath);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (!stat.isFile()) {
    return NextResponse.json({ error: "Not a file" }, { status: 400 });
  }

  const data = await fs.readFile(fullPath);
  const body = new Uint8Array(data);

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
