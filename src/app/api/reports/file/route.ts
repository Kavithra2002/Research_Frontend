import { NextRequest, NextResponse } from "next/server";
import path from "node:path";

import { isSafeSegment, readBytes, statFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Split a Demo_Data-relative file path into safe path segments. */
function splitFilePath(file: string): string[] | null {
  const normalized = file.replace(/\\/g, "/").trim();
  if (!normalized || normalized.includes("..") || normalized.includes("\0")) {
    return null;
  }
  const parts = normalized.split("/").filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  if (!parts.every(isSafeSegment)) return null;
  return parts;
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

  if (![company, type].every(isSafeSegment)) {
    return NextResponse.json(
      { error: "Invalid path segment" },
      { status: 400 },
    );
  }

  const fileParts = splitFilePath(file);
  if (!fileParts) {
    return NextResponse.json(
      { error: "Invalid path segment" },
      { status: 400 },
    );
  }

  const basename = fileParts[fileParts.length - 1] ?? "";
  const ext = path.extname(basename).toLowerCase();
  if (ext !== ".pdf") {
    return NextResponse.json(
      { error: "Only .pdf files are served" },
      { status: 400 },
    );
  }

  const segments = [company, type, ...fileParts] as const;

  const stat = await statFile("reports", ...segments);
  if (!stat) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  let body: Uint8Array;
  try {
    body = await readBytes("reports", ...segments);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const disposition = download
    ? `attachment; filename="${encodeURIComponent(basename)}"`
    : `inline; filename="${encodeURIComponent(basename)}"`;

  return new NextResponse(Buffer.from(body), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(stat.size),
      "Content-Disposition": disposition,
      "Cache-Control": "private, max-age=60",
    },
  });
}
