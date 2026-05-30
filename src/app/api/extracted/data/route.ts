import { NextRequest, NextResponse } from "next/server";

import { isSafeSegment, readUtf8 } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  const resultsFile = `${company}_results.json`;

  let raw: string;
  try {
    raw = await readUtf8("testing", company, resultsFile);
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
    const rawMeta = await readUtf8("testing", company, "extraction_meta.json");
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
