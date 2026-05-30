import { NextResponse } from "next/server";

import { getLocalRoot, isR2Storage, listDirectory } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ReportFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

export type CompanyReports = {
  name: string;
  reportTypes: Record<string, ReportFile[]>;
  totalReports: number;
};

const ALLOWED_EXTENSIONS = new Set([".pdf"]);

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export async function GET() {
  const reportsRoot = isR2Storage()
    ? `r2://${process.env.R2_BUCKET}/reports`
    : getLocalRoot("reports");

  let companyDirs;
  try {
    companyDirs = await listDirectory("reports");
  } catch (error) {
    return NextResponse.json(
      {
        error: "Reports directory could not be read",
        path: reportsRoot,
        details: error instanceof Error ? error.message : String(error),
        companies: [],
      },
      { status: 500 },
    );
  }

  const companies: CompanyReports[] = [];

  for (const companyName of companyDirs.directories) {
    const typeLevel = await listDirectory("reports", companyName);
    const reportTypes: Record<string, ReportFile[]> = {};
    let totalReports = 0;

    for (const typeName of typeLevel.directories) {
      const filesLevel = await listDirectory("reports", companyName, typeName);
      const files: ReportFile[] = [];

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
        totalReports += files.length;
      }
    }

    if (totalReports > 0) {
      companies.push({
        name: companyName,
        reportTypes,
        totalReports,
      });
    }
  }

  companies.sort((a, b) => naturalCompare(a.name, b.name));

  return NextResponse.json({
    root: reportsRoot,
    companies,
  });
}
