import { NextResponse } from "next/server";

import {
  getLocalRoot,
  isR2Storage,
  listDirectory,
  readUtf8,
  statFile,
} from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ExtractedReportFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

export type ExtractedCompany = {
  name: string;
  displayName: string;
  resultsFile: string;
  metaFile: string | null;
  statements: string[];
  model: string | null;
  generatedAt: string | null;
  status: string | null;
  hasReports: boolean;
  reportTypes: Record<string, ExtractedReportFile[]>;
  totalReports: number;
};

const ALLOWED_EXTENSIONS = new Set([".pdf"]);

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function prettifyCompanyName(name: string) {
  return name.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

type MetaFile = {
  company?: string;
  model?: string;
  generated_at?: string;
  statements?: string[];
};

type RunLogEntry = {
  company?: string;
  status?: string;
};

type RunLogFile = {
  generated_at?: string;
  results?: RunLogEntry[];
};

async function readJsonSafe<T>(
  ...segments: string[]
): Promise<T | null> {
  try {
    const raw = await readUtf8("testing", ...segments);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function loadCompanyReports(
  company: string,
): Promise<{ reportTypes: Record<string, ExtractedReportFile[]>; total: number }> {
  const reportTypes: Record<string, ExtractedReportFile[]> = {};
  let total = 0;

  const typeLevel = await listDirectory("reports", company);

  for (const typeName of typeLevel.directories) {
    const filesLevel = await listDirectory("reports", company, typeName);
    const files: ExtractedReportFile[] = [];

    for (const f of filesLevel.files) {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;
      files.push({
        name: f.name,
        size: f.size,
        modifiedAt: f.modifiedAt,
      });
    }

    files.sort((a, b) => naturalCompare(a.name, b.name));

    if (files.length > 0) {
      reportTypes[typeName] = files;
      total += files.length;
    }
  }

  return { reportTypes, total };
}

export async function GET() {
  const extractedRoot = isR2Storage()
    ? `r2://${process.env.R2_BUCKET}/testing`
    : getLocalRoot("testing");
  const reportsRoot = isR2Storage()
    ? `r2://${process.env.R2_BUCKET}/reports`
    : getLocalRoot("reports");

  let rootEntries;
  try {
    rootEntries = await listDirectory("testing");
  } catch (error) {
    return NextResponse.json(
      {
        error: "Extracted JSON directory could not be read",
        path: extractedRoot,
        details: error instanceof Error ? error.message : String(error),
        companies: [],
      },
      { status: 500 },
    );
  }

  const runLog = await readJsonSafe<RunLogFile>("_run_log.json");
  const runOrder: string[] = [];
  const runStatus = new Map<string, string>();
  if (runLog && Array.isArray(runLog.results)) {
    for (const r of runLog.results) {
      if (!r || typeof r.company !== "string") continue;
      runOrder.push(r.company);
      if (typeof r.status === "string") runStatus.set(r.company, r.status);
    }
  }

  const companies: ExtractedCompany[] = [];

  for (const companyName of rootEntries.directories) {
    const resultsFile = `${companyName}_results.json`;
    const resultsStat = await statFile("testing", companyName, resultsFile);
    if (!resultsStat) continue;

    const meta = await readJsonSafe<MetaFile>(
      companyName,
      "extraction_meta.json",
    );

    let statements: string[] = Array.isArray(meta?.statements)
      ? (meta!.statements as string[]).slice()
      : [];

    if (statements.length === 0) {
      const results = await readJsonSafe<Record<string, unknown>>(
        companyName,
        resultsFile,
      );
      if (results && typeof results === "object") {
        statements = Object.keys(results);
      }
    }

    const { reportTypes, total } = await loadCompanyReports(companyName);

    companies.push({
      name: companyName,
      displayName: prettifyCompanyName(companyName),
      resultsFile,
      metaFile: meta ? "extraction_meta.json" : null,
      statements,
      model: meta?.model ?? null,
      generatedAt: meta?.generated_at ?? null,
      status: runStatus.get(companyName) ?? null,
      hasReports: total > 0,
      reportTypes,
      totalReports: total,
    });
  }

  const orderIndex = new Map<string, number>();
  runOrder.forEach((name, idx) => {
    if (!orderIndex.has(name)) orderIndex.set(name, idx);
  });

  companies.sort((a, b) => {
    const ai = orderIndex.has(a.name) ? orderIndex.get(a.name)! : Infinity;
    const bi = orderIndex.has(b.name) ? orderIndex.get(b.name)! : Infinity;
    if (ai !== bi) return ai - bi;
    return naturalCompare(a.displayName, b.displayName);
  });

  return NextResponse.json({
    root: extractedRoot,
    reportsRoot,
    companies,
  });
}
