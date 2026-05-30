import { NextRequest, NextResponse } from "next/server";
import path from "node:path";

import { isSafeSegment, readBytes, statFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const stat = await statFile("reports", company, type, file);
  if (!stat) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  let body: Uint8Array;
  try {
    body = await readBytes("reports", company, type, file);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const disposition = download
    ? `attachment; filename="${encodeURIComponent(file)}"`
    : `inline; filename="${encodeURIComponent(file)}"`;

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
