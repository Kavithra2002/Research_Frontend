import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

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

function getReportsRoot() {
  const fromEnv = process.env.REPORTS_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
  return path.resolve(process.cwd(), "..", "backend", "reports");
}

async function readDirSafe(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function GET() {
  const reportsRoot = getReportsRoot();

  let rootEntries;
  try {
    rootEntries = await fs.readdir(reportsRoot, { withFileTypes: true });
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

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;

    const companyDir = path.join(reportsRoot, entry.name);
    const reportTypeEntries = await readDirSafe(companyDir);
    const reportTypes: Record<string, ReportFile[]> = {};
    let totalReports = 0;

    for (const typeEntry of reportTypeEntries) {
      if (!typeEntry.isDirectory()) continue;

      const typeDir = path.join(companyDir, typeEntry.name);
      const fileEntries = await readDirSafe(typeDir);
      const files: ReportFile[] = [];

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
        totalReports += files.length;
      }
    }

    if (totalReports > 0) {
      companies.push({
        name: entry.name,
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
