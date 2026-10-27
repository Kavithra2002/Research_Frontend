import { NextRequest, NextResponse } from "next/server";

import { isSafeSegment, listDirectory, readUtf8 } from "@/lib/storage";
import {
  normalizeCapturePeriod,
  resolveDemoCaptureCompanyDir,
  type CapturePeriod,
} from "@/lib/demo-captures";

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

function capturesFolderForPeriod(period: CapturePeriod): string {
  return period === "Quarterly" ? "captures_quarterly" : "captures";
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function buildDemoImageUrl(
  company: string,
  statement: string,
  file: string,
  period: CapturePeriod,
  year: string,
) {
  const params = new URLSearchParams({
    company,
    statement,
    file,
    period,
    year,
    source: "demo",
  });
  return `/api/extracted/capture?${params.toString()}`;
}

function buildLegacyImageUrl(
  company: string,
  statement: string,
  file: string,
  period: CapturePeriod,
) {
  const params = new URLSearchParams({ company, statement, file, period });
  return `/api/extracted/capture?${params.toString()}`;
}

type CaptureIndex = {
  statements?: Record<string, string[]>;
};

/** Fixed list written beside the images: `<year>/index.json`. */
async function statementsFromIndex(
  demoDir: string,
  period: CapturePeriod,
  year: string,
  company: string,
): Promise<CaptureStatement[] | null> {
  let raw: string;
  try {
    raw = await readUtf8(
      "demo_captures",
      demoDir,
      period,
      year,
      "index.json",
    );
  } catch {
    return null;
  }

  let index: CaptureIndex;
  try {
    index = JSON.parse(raw) as CaptureIndex;
  } catch {
    return null;
  }

  const statements: CaptureStatement[] = [];
  const entries = Object.entries(index.statements ?? {});
  entries.sort(([a], [b]) => naturalCompare(a, b));

  for (const [statementKey, files] of entries) {
    if (!isSafeSegment(statementKey)) continue;
    const images: CaptureImage[] = [];
    for (const file of files ?? []) {
      if (!isSafeSegment(file)) continue;
      const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) continue;
      images.push({
        name: file,
        size: 0,
        modifiedAt: "",
        url: buildDemoImageUrl(company, statementKey, file, period, year),
      });
    }
    if (images.length > 0) statements.push({ key: statementKey, images });
  }

  return statements.length > 0 ? statements : null;
}

async function collectStatements(
  listSegments: string[],
  buildUrl: (statement: string, file: string) => string,
): Promise<CaptureStatement[]> {
  const statementLevel = await listDirectory(
    listSegments[0] as "demo_captures" | "testing",
    ...listSegments.slice(1),
  );
  const statements: CaptureStatement[] = [];

  for (const statementKey of statementLevel.directories) {
    if (!isSafeSegment(statementKey)) continue;

    const filesLevel = await listDirectory(
      listSegments[0] as "demo_captures" | "testing",
      ...listSegments.slice(1),
      statementKey,
    );
    const images: CaptureImage[] = [];

    for (const file of filesLevel.files) {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) continue;
      images.push({
        name: file.name,
        size: file.size,
        modifiedAt: file.modifiedAt,
        url: buildUrl(statementKey, file.name),
      });
    }

    images.sort((a, b) => naturalCompare(a.name, b.name));
    if (images.length > 0) statements.push({ key: statementKey, images });
  }

  statements.sort((a, b) => naturalCompare(a.key, b.key));
  return statements;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");
  const period = normalizeCapturePeriod(searchParams.get("period"));
  const yearParam = searchParams.get("year");

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

  // Primary source: Demo_Data_captures, organised company → period → year →
  // statement_key. Requires a 4-digit year so the right report's pages show.
  if (yearParam && /^\d{4}$/.test(yearParam)) {
    const demoDir = await resolveDemoCaptureCompanyDir(company);
    if (demoDir) {
      const indexed = await statementsFromIndex(
        demoDir,
        period,
        yearParam,
        company,
      );
      const statements =
        indexed ??
        (await collectStatements(
          ["demo_captures", demoDir, period, yearParam],
          (statement, file) =>
            buildDemoImageUrl(company, statement, file, period, yearParam),
        ));
      if (statements.length > 0) {
        return NextResponse.json({
          company,
          period,
          year: Number(yearParam),
          source: "demo_captures",
          statements,
        });
      }
    }
  }

  // Fallback: legacy per-company captures under testing/<company>/captures.
  const capturesFolder = capturesFolderForPeriod(period);
  const statements = await collectStatements(
    ["testing", company, capturesFolder],
    (statement, file) =>
      buildLegacyImageUrl(company, statement, file, period),
  );

  return NextResponse.json({
    company,
    period,
    capturesFolder,
    source: "testing",
    statements,
  });
}
