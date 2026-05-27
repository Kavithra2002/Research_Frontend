import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getScriptRoot() {
  const fromEnv = process.env.SCRIPT_ROOT;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
  return path.resolve(process.cwd(), "..", "backend");
}

function getExtractedRoot() {
  const fromEnv = process.env.EXTRACTED_JSON_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
  return path.resolve(getScriptRoot(), "testing");
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
  const companyDir = path.resolve(extractedRoot, company);

  if (
    !companyDir.startsWith(extractedRoot + path.sep) &&
    companyDir !== extractedRoot
  ) {
    return NextResponse.json(
      { error: "Path traversal detected" },
      { status: 400 },
    );
  }

  const resultsPath = path.join(companyDir, `${company}_results.json`);
  const metaPath = path.join(companyDir, "extraction_meta.json");

  let raw: string;
  try {
    raw = await fs.readFile(resultsPath, "utf8");
  } catch {
    return NextResponse.json(
      { error: "Extracted results not found", company },
      { status: 404 },
    );
  }

  let results: unknown;
  try {
    results = JSON.parse(raw);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to parse results JSON",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }

  let meta: unknown = null;
  try {
    const rawMeta = await fs.readFile(metaPath, "utf8");
    meta = JSON.parse(rawMeta);
  } catch {
    meta = null;
  }

  return NextResponse.json({
    company,
    meta,
    results,
  });
}
