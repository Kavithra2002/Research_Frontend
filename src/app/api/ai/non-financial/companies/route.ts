import { NextResponse } from "next/server";

import {
  listDirectory,
  resolvePdfPath,
  statFile,
} from "@/lib/storage";

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

function isAnnualReportType(name: string) {
  return name.trim().toLowerCase().includes("annual");
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function collectReportsFrom(
  source: SourceKey,
): Promise<Map<string, CompanyReportRef[]>> {
  const out = new Map<string, CompanyReportRef[]>();
  const companyLevel = await listDirectory(source);

  for (const companyName of companyLevel.directories) {
    const typeLevel = await listDirectory(source, companyName);
    const refs: CompanyReportRef[] = [];

    for (const typeName of typeLevel.directories) {
      if (!isAnnualReportType(typeName)) continue;
      const filesLevel = await listDirectory(source, companyName, typeName);

      for (const f of filesLevel.files) {
        const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
        if (!ALLOWED_EXTS.has(ext)) continue;
        const stat = await statFile(source, companyName, typeName, f.name);
        if (!stat) continue;

        refs.push({
          source,
          reportType: typeName,
          fileName: f.name,
          fullPath: resolvePdfPath(source, companyName, typeName, f.name),
          size: stat.size,
          modifiedAt: stat.modifiedAt,
        });
      }
    }

    if (refs.length > 0) {
      out.set(companyName, refs);
    }
  }

  return out;
}

export async function GET() {
  const merged = new Map<string, CompanyEntry>();

  for (const key of ["newly_uploaded_report", "reports"] as const) {
    const fromSource = await collectReportsFrom(key);
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
