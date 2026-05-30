import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SourceKey = "newly_uploaded_report" | "reports";

type CompanyReportRef = {
  source: SourceKey;
  reportType: string;
  fileName: string;
  fullPath: string;
  size: number;
  modifiedAt: string;
};

type CompanyEntry = {
  name: string;
  displayName: string;
  reports: CompanyReportRef[];
  latestModifiedAt: string | null;
};

const ALLOWED_EXTS = new Set([".pdf"]);

// The non-financial briefing only consumes Annual reports. Quarterly (or any
// other) report types are intentionally hidden from this section so the UI
// can't pick a PDF the script won't analyse.
function isAnnualReportType(name: string) {
  return name.trim().toLowerCase().includes("annual");
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function backendDir() {
  const fromEnv = process.env.SCRIPT_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
  return path.resolve(process.cwd(), "..", "backend");
}

function sourceRoots(): { key: SourceKey; dir: string }[] {
  const root = backendDir();
  return [
    { key: "newly_uploaded_report", dir: path.join(root, "newly_uploaded_report") },
    { key: "reports", dir: path.join(root, "reports") },
  ];
}

async function readDirSafe(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function collectReportsFrom(
  source: SourceKey,
  rootDir: string,
): Promise<Map<string, CompanyReportRef[]>> {
  const out = new Map<string, CompanyReportRef[]>();
  const companyEntries = await readDirSafe(rootDir);

  for (const companyEntry of companyEntries) {
    if (!companyEntry.isDirectory()) continue;

    const companyDir = path.join(rootDir, companyEntry.name);
    const typeEntries = await readDirSafe(companyDir);

    const refs: CompanyReportRef[] = [];
    for (const typeEntry of typeEntries) {
      if (!typeEntry.isDirectory()) continue;
      if (!isAnnualReportType(typeEntry.name)) continue;
      const typeDir = path.join(companyDir, typeEntry.name);
      const fileEntries = await readDirSafe(typeDir);

      for (const fileEntry of fileEntries) {
        if (!fileEntry.isFile()) continue;
        const ext = path.extname(fileEntry.name).toLowerCase();
        if (!ALLOWED_EXTS.has(ext)) continue;
        const filePath = path.join(typeDir, fileEntry.name);
        const stat = await fs.stat(filePath).catch(() => null);
        if (!stat) continue;

        refs.push({
          source,
          reportType: typeEntry.name,
          fileName: fileEntry.name,
          fullPath: filePath,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }

    if (refs.length > 0) {
      out.set(companyEntry.name, refs);
    }
  }

  return out;
}

export async function GET() {
  const merged = new Map<string, CompanyEntry>();

  for (const { key, dir } of sourceRoots()) {
    const fromSource = await collectReportsFrom(key, dir);
    for (const [name, refs] of fromSource) {
      const existing = merged.get(name);
      if (existing) {
        existing.reports.push(...refs);
      } else {
        merged.set(name, {
          name,
          displayName: name,
          reports: [...refs],
          latestModifiedAt: null,
        });
      }
    }
  }

  const companies: CompanyEntry[] = [];
  for (const entry of merged.values()) {
    // Prefer the Annual report on top.
    entry.reports.sort((a, b) => {
      const aAnnual = a.reportType.toLowerCase().includes("annual") ? 0 : 1;
      const bAnnual = b.reportType.toLowerCase().includes("annual") ? 0 : 1;
      if (aAnnual !== bAnnual) return aAnnual - bAnnual;
      return b.modifiedAt.localeCompare(a.modifiedAt);
    });

    entry.latestModifiedAt =
      entry.reports.length > 0
        ? entry.reports.reduce<string>(
            (latest, ref) =>
              ref.modifiedAt > latest ? ref.modifiedAt : latest,
            entry.reports[0].modifiedAt,
          )
        : null;

    companies.push(entry);
  }

  companies.sort((a, b) => naturalCompare(a.displayName, b.displayName));

  return NextResponse.json({ companies });
}
