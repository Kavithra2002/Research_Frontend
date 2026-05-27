import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

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

function getReportsRoot() {
  const fromEnv = process.env.REPORTS_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
  return path.resolve(getScriptRoot(), "reports");
}

function prettifyCompanyName(name: string) {
  return name.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

async function readDirSafe(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readJsonSafe<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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

async function loadCompanyReports(
  reportsRoot: string,
  company: string,
): Promise<{ reportTypes: Record<string, ExtractedReportFile[]>; total: number }> {
  const reportTypes: Record<string, ExtractedReportFile[]> = {};
  let total = 0;

  const companyDir = path.join(reportsRoot, company);
  const typeEntries = await readDirSafe(companyDir);

  for (const typeEntry of typeEntries) {
    if (!typeEntry.isDirectory()) continue;

    const typeDir = path.join(companyDir, typeEntry.name);
    const fileEntries = await readDirSafe(typeDir);
    const files: ExtractedReportFile[] = [];

    for (const fileEntry of fileEntries) {
      if (!fileEntry.isFile()) continue;
      const ext = path.extname(fileEntry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;

      const stat = await fs
        .stat(path.join(typeDir, fileEntry.name))
        .catch(() => null);
      if (!stat) continue;

      files.push({
        name: fileEntry.name,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }

    files.sort((a, b) => naturalCompare(a.name, b.name));

    if (files.length > 0) {
      reportTypes[typeEntry.name] = files;
      total += files.length;
    }
  }

  return { reportTypes, total };
}

export async function GET() {
  const extractedRoot = getExtractedRoot();
  const reportsRoot = getReportsRoot();

  let rootEntries;
  try {
    rootEntries = await fs.readdir(extractedRoot, { withFileTypes: true });
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

  const runLog = await readJsonSafe<RunLogFile>(
    path.join(extractedRoot, "_run_log.json"),
  );
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

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;

    const companyDir = path.join(extractedRoot, entry.name);
    const resultsPath = path.join(companyDir, `${entry.name}_results.json`);
    const metaPath = path.join(companyDir, "extraction_meta.json");

    const resultsStat = await fs.stat(resultsPath).catch(() => null);
    if (!resultsStat || !resultsStat.isFile()) continue;

    const meta = await readJsonSafe<MetaFile>(metaPath);

    let statements: string[] = Array.isArray(meta?.statements)
      ? (meta!.statements as string[]).slice()
      : [];

    if (statements.length === 0) {
      const results = await readJsonSafe<Record<string, unknown>>(resultsPath);
      if (results && typeof results === "object") {
        statements = Object.keys(results);
      }
    }

    const { reportTypes, total } = await loadCompanyReports(
      reportsRoot,
      entry.name,
    );

    companies.push({
      name: entry.name,
      displayName: prettifyCompanyName(entry.name),
      resultsFile: `${entry.name}_results.json`,
      metaFile: meta ? "extraction_meta.json" : null,
      statements,
      model: meta?.model ?? null,
      generatedAt: meta?.generated_at ?? null,
      status: runStatus.get(entry.name) ?? null,
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
