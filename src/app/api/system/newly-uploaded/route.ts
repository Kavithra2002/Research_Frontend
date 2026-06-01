import { NextResponse } from "next/server";

import {
  getLocalRoot,
  isR2Storage,
  isSafeSegment,
  listDirectory,
} from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type UploadedFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

export type UploadedReport = {
  company: string;
  reportType: string;
  files: UploadedFile[];
};

const ALLOWED_EXTENSIONS = new Set([".pdf"]);

/** Primary R2/local prefix for newly scanned reports. */
const UPDATED_REPORTS_ROOT = "updated_reports" as const;
/** Legacy prefix (local dev / older uploads). */
const LEGACY_ROOT = "newly_uploaded_report" as const;

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function listFromRoot(
  root: typeof UPDATED_REPORTS_ROOT | typeof LEGACY_ROOT,
): Promise<UploadedReport[]> {
  const reports: UploadedReport[] = [];
  const companyLevel = await listDirectory(root);

  for (const company of companyLevel.directories) {
    if (!isSafeSegment(company)) continue;
    const typeLevel = await listDirectory(root, company);

    for (const reportType of typeLevel.directories) {
      if (!isSafeSegment(reportType)) continue;
      const filesLevel = await listDirectory(root, company, reportType);
      const files: UploadedFile[] = [];

      for (const f of filesLevel.files) {
        const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;
        files.push({
          name: f.name,
          size: f.size,
          modifiedAt: f.modifiedAt,
        });
      }

      if (files.length === 0) continue;
      files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
      reports.push({ company, reportType, files });
    }
  }

  return reports;
}

function mergeReports(
  primary: UploadedReport[],
  legacy: UploadedReport[],
): UploadedReport[] {
  const map = new Map<string, UploadedReport>();

  const key = (r: UploadedReport) => `${r.company}\0${r.reportType}`;

  for (const r of [...primary, ...legacy]) {
    const k = key(r);
    const existing = map.get(k);
    if (!existing) {
      map.set(k, { ...r, files: [...r.files] });
      continue;
    }
    const seen = new Set(existing.files.map((f) => f.name));
    for (const f of r.files) {
      if (!seen.has(f.name)) {
        existing.files.push(f);
        seen.add(f.name);
      }
    }
    existing.files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  const merged = Array.from(map.values());
  merged.sort((a, b) => {
    const byCompany = naturalCompare(a.company, b.company);
    if (byCompany !== 0) return byCompany;
    return naturalCompare(a.reportType, b.reportType);
  });
  return merged;
}

export async function GET() {
  try {
    const [updated, legacy] = await Promise.all([
      listFromRoot(UPDATED_REPORTS_ROOT),
      listFromRoot(LEGACY_ROOT),
    ]);
    const reports = mergeReports(updated, legacy);

    const root = isR2Storage()
      ? `r2://${process.env.R2_BUCKET}/${UPDATED_REPORTS_ROOT}`
      : getLocalRoot(UPDATED_REPORTS_ROOT);

    return NextResponse.json({ root, reports });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        reports: [],
      },
      { status: 500 },
    );
  }
}
