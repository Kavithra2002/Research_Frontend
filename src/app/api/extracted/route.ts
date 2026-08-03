import { NextResponse } from "next/server";

import { fetchBackend } from "@/lib/backend-api";
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

export type ExtractedPeriodSummary = {
  statements: string[];
  statementCount: number;
  tableCount: number;
  model: string | null;
  generatedAt: string | null;
  availableQuarters?: string[];
};

export type ExtractedYearNode = {
  year: number;
  annual: ExtractedPeriodSummary | null;
  quarterly: ExtractedPeriodSummary | null;
  availablePeriods: ("Annual" | "Quarterly")[];
};

export type ExtractedCompany = {
  name: string;
  displayName: string;
  sector?: string | null;
  sectorDetail?: string | null;
  resultsFile: string;
  metaFile: string | null;
  statements: string[];
  model: string | null;
  generatedAt: string | null;
  status: string | null;
  hasReports: boolean;
  reportTypes: Record<string, ExtractedReportFile[]>;
  totalReports: number;
  hasAnnual: boolean;
  hasQuarterly: boolean;
  availablePeriods: ("Annual" | "Quarterly")[];
  quarterlyStatements: string[];
  quarterlyGeneratedAt: string | null;
  quarterlyModel: string | null;
  /** Present when data is served from MongoDB (Company → Year → period). */
  years?: ExtractedYearNode[];
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

type MongoListPayload = {
  source?: string;
  companies?: Array<{
    name: string;
    displayName: string;
    sector?: string | null;
    sectorDetail?: string | null;
    years?: ExtractedYearNode[];
    hasAnnual?: boolean;
    hasQuarterly?: boolean;
    availablePeriods?: ("Annual" | "Quarterly")[];
  }>;
};

async function listFromMongo(): Promise<NextResponse | null> {
  try {
    const res = await fetchBackend("/extracted");
    if (!res.ok) return null;
    const data = (await res.json()) as MongoListPayload;
    if (data.source !== "mongodb" || !Array.isArray(data.companies)) {
      return null;
    }
    if (data.companies.length === 0) {
      return null;
    }

    const companies: ExtractedCompany[] = data.companies.map((c) => {
      const firstYear = c.years?.[0];
      return {
        name: c.name,
        displayName: c.displayName,
        sector: c.sector ?? null,
        sectorDetail: c.sectorDetail ?? null,
        years: c.years ?? [],
        resultsFile: "",
        metaFile: null,
        statements: firstYear?.annual?.statements ?? [],
        model: firstYear?.annual?.model ?? null,
        generatedAt: firstYear?.annual?.generatedAt ?? null,
        status: null,
        hasReports: false,
        reportTypes: {},
        totalReports: 0,
        hasAnnual: Boolean(c.hasAnnual),
        hasQuarterly: Boolean(c.hasQuarterly),
        availablePeriods: c.availablePeriods ?? [],
        quarterlyStatements: firstYear?.quarterly?.statements ?? [],
        quarterlyGeneratedAt: firstYear?.quarterly?.generatedAt ?? null,
        quarterlyModel: firstYear?.quarterly?.model ?? null,
      };
    });

    return NextResponse.json({
      source: "mongodb",
      root: "mongodb://financial_tables",
      reportsRoot: null,
      companies,
    });
  } catch {
    return null;
  }
}

export async function GET() {
  const mongoResponse = await listFromMongo();
  if (mongoResponse) return mongoResponse;

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
    const resultsFile          = `${companyName}_results.json`;
    const quarterlyResultsFile = `${companyName}_quarterly_results.json`;

    const resultsStat = await statFile("testing", companyName, resultsFile);
    const quarterlyStat = await statFile(
      "testing",
      companyName,
      quarterlyResultsFile,
    );

    // Show the company in the picker if EITHER an annual or a quarterly
    // results JSON exists.
    if (!resultsStat && !quarterlyStat) continue;

    const meta = await readJsonSafe<MetaFile>(
      companyName,
      "extraction_meta.json",
    );
    const quarterlyMeta = await readJsonSafe<MetaFile>(
      companyName,
      "extraction_meta_quarterly.json",
    );

    let statements: string[] = Array.isArray(meta?.statements)
      ? (meta!.statements as string[]).slice()
      : [];

    if (statements.length === 0 && resultsStat) {
      const results = await readJsonSafe<Record<string, unknown>>(
        companyName,
        resultsFile,
      );
      if (results && typeof results === "object") {
        statements = Object.keys(results);
      }
    }

    let quarterlyStatements: string[] = Array.isArray(quarterlyMeta?.statements)
      ? (quarterlyMeta!.statements as string[]).slice()
      : [];

    if (quarterlyStatements.length === 0 && quarterlyStat) {
      const qResults = await readJsonSafe<Record<string, unknown>>(
        companyName,
        quarterlyResultsFile,
      );
      if (qResults && typeof qResults === "object") {
        const qStmts = (qResults as { statements?: Record<string, unknown> })
          .statements;
        quarterlyStatements = qStmts && typeof qStmts === "object"
          ? Object.keys(qStmts)
          : Object.keys(qResults);
      }
    }

    const { reportTypes, total } = await loadCompanyReports(companyName);

    const hasAnnual    = Boolean(resultsStat);
    const hasQuarterly = Boolean(quarterlyStat);
    const availablePeriods: ("Annual" | "Quarterly")[] = [];
    if (hasAnnual) availablePeriods.push("Annual");
    if (hasQuarterly) availablePeriods.push("Quarterly");

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
      hasAnnual,
      hasQuarterly,
      availablePeriods,
      quarterlyStatements,
      quarterlyGeneratedAt: quarterlyMeta?.generated_at ?? null,
      quarterlyModel:        quarterlyMeta?.model ?? null,
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
    source: "filesystem",
    root: extractedRoot,
    reportsRoot,
    companies,
  });
}
