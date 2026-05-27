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

const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export type CaptureImage = {
  name: string;
  size: number;
  modifiedAt: string;
  url: string;
};

export type CaptureStatement = {
  key: string;
  images: CaptureImage[];
};

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function readDirSafe(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function buildImageUrl(company: string, statement: string, file: string) {
  const params = new URLSearchParams({ company, statement, file });
  return `/api/extracted/capture?${params.toString()}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");

  if (!company) {
    return NextResponse.json(
      { error: "Missing required query param: company" },
      { status: 400 },
    );
  }

  if (!isSafeSegment(company)) {
    return NextResponse.json(
      { error: "Invalid company segment" },
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

  const capturesDir = path.resolve(companyDir, "captures");
  const statementEntries = await readDirSafe(capturesDir);
  const statements: CaptureStatement[] = [];

  for (const entry of statementEntries) {
    if (!entry.isDirectory()) continue;
    if (!isSafeSegment(entry.name)) continue;

    const stmtDir = path.join(capturesDir, entry.name);
    const fileEntries = await readDirSafe(stmtDir);
    const images: CaptureImage[] = [];

    for (const fileEntry of fileEntries) {
      if (!fileEntry.isFile()) continue;
      const ext = path.extname(fileEntry.name).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) continue;

      const stat = await fs
        .stat(path.join(stmtDir, fileEntry.name))
        .catch(() => null);
      if (!stat) continue;

      images.push({
        name: fileEntry.name,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        url: buildImageUrl(company, entry.name, fileEntry.name),
      });
    }

    images.sort((a, b) => naturalCompare(a.name, b.name));

    if (images.length > 0) {
      statements.push({ key: entry.name, images });
    }
  }

  return NextResponse.json({
    company,
    capturesRoot: capturesDir,
    statements,
  });
}
