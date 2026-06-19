import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type MacChartFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

export type MacChartYear = {
  year: string;
  files: MacChartFile[];
};

function getMacReportsRoot(): string {
  const scriptRoot =
    process.env.SCRIPT_ROOT?.trim() ||
    path.resolve(process.cwd(), "..", "backend");
  const fromEnv = process.env.MAC_REPORTS_DIR?.trim();
  return fromEnv ? path.resolve(fromEnv) : path.join(scriptRoot, "MaC Reports");
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function safeReaddir(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function GET() {
  const root = getMacReportsRoot();

  let yearEntries;
  try {
    yearEntries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: `MaC Reports directory could not be read: ${root}`,
        details: error instanceof Error ? error.message : String(error),
        years: [] as MacChartYear[],
        totalReports: 0,
      },
      { status: 200 },
    );
  }

  const years: MacChartYear[] = [];

  for (const entry of yearEntries) {
    if (!entry.isDirectory()) continue;
    if (!/^\d{4}$/.test(entry.name)) continue;

    const yearDir = path.join(root, entry.name);
    const fileEntries = await safeReaddir(yearDir);
    const files: MacChartFile[] = [];

    for (const fileEntry of fileEntries) {
      if (!fileEntry.isFile()) continue;
      if (!fileEntry.name.toLowerCase().endsWith(".pdf")) continue;
      const abs = path.join(yearDir, fileEntry.name);
      try {
        const stat = await fs.stat(abs);
        files.push({
          name: fileEntry.name,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      } catch {
        /* ignore */
      }
    }

    files.sort((a, b) => naturalCompare(b.name, a.name));

    if (files.length > 0) {
      years.push({ year: entry.name, files });
    }
  }

  years.sort((a, b) => naturalCompare(b.year, a.year));

  const totalReports = years.reduce((n, y) => n + y.files.length, 0);

  return NextResponse.json({
    root,
    years,
    totalReports,
  });
}
