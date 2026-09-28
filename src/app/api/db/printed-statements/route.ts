import fs from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SLUG_RE = /^[A-Za-z0-9_-]+$/;

function printedRoot(): string {
  return path.resolve(
    process.cwd(),
    "..",
    "backend",
    "extracted",
    "printed_statements",
  );
}

export async function GET(request: NextRequest) {
  const company = request.nextUrl.searchParams.get("company")?.trim() ?? "";
  const yearParam = request.nextUrl.searchParams.get("year")?.trim() ?? "";
  if (!company || !SLUG_RE.test(company)) {
    return NextResponse.json(
      { error: "Missing or invalid company." },
      { status: 400 },
    );
  }

  const dir = path.join(printedRoot(), company);
  if (!fs.existsSync(dir)) {
    return NextResponse.json(
      {
        error:
          "Printed statements are not extracted for this company yet. Run the printed-statement extractor for an annual report.",
        statements: [],
        notes: {},
      },
      { status: 404 },
    );
  }

  const years = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => Number(name.slice(0, -5)))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => b - a);

  const requested = Number(yearParam);
  const wantAll = yearParam === "all";
  const year =
    yearParam && years.includes(requested) ? requested : (years[0] ?? null);
  if (!year) {
    return NextResponse.json(
      { error: "No printed statement files for this company.", statements: [] },
      { status: 404 },
    );
  }

  try {
    const readYear = (value: number) => {
      const raw = fs.readFileSync(path.join(dir, `${value}.json`), "utf8");
      return JSON.parse(raw) as Record<string, unknown>;
    };
    if (wantAll) {
      return NextResponse.json({
        available_years: years,
        reports: years.map((value) => readYear(value)),
      });
    }
    const payload = readYear(year);
    return NextResponse.json({ ...payload, available_years: years });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read statements." },
      { status: 500 },
    );
  }
}
