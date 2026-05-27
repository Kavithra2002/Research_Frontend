import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

import {
  getExtractedRoot,
  isSafeSegment,
  resolveCompanyDir,
} from "@/lib/extracted-paths";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");
  const statement = searchParams.get("statement");
  const file = searchParams.get("file");

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

  const extractedRoot = getExtractedRoot();
  const companyDir = resolveCompanyDir(extractedRoot, company);

  if (!companyDir) {
    return NextResponse.json(
      { error: "Path traversal detected" },
      { status: 400 },
    );
  }

  const fullPath = path.resolve(
    companyDir,
    "captures",
    statement,
    file,
  );

  const capturesRoot = path.resolve(companyDir, "captures");
  if (
    !fullPath.startsWith(capturesRoot + path.sep) &&
    fullPath !== capturesRoot
  ) {
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

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=300",
    },
  });
}
