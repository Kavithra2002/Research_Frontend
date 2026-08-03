import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

import { resolveDemoPdfAbsPath } from "@/lib/demo-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rel = searchParams.get("rel");

  if (!rel?.trim()) {
    return NextResponse.json(
      { error: "Missing required query param: rel" },
      { status: 400 },
    );
  }

  const abs = resolveDemoPdfAbsPath(rel);
  if (!abs) {
    return NextResponse.json({ error: "Invalid PDF path" }, { status: 400 });
  }

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(abs);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  if (!stat.isFile()) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  let body: Buffer;
  try {
    body = await fs.readFile(abs);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const filename = path.basename(abs);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(stat.size),
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
