import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

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

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function getRoot() {
  const fromEnv = process.env.NEWLY_UPLOADED_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
  return path.resolve(process.cwd(), "..", "backend", "newly_uploaded_report");
}

async function readDirSafe(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function GET() {
  const root = getRoot();
  await fs.mkdir(root, { recursive: true }).catch(() => undefined);

  const companyEntries = await readDirSafe(root);
  const reports: UploadedReport[] = [];

  for (const companyEntry of companyEntries) {
    if (!companyEntry.isDirectory()) continue;

    const companyDir = path.join(root, companyEntry.name);
    const typeEntries = await readDirSafe(companyDir);

    for (const typeEntry of typeEntries) {
      if (!typeEntry.isDirectory()) continue;

      const typeDir = path.join(companyDir, typeEntry.name);
      const fileEntries = await readDirSafe(typeDir);
      const files: UploadedFile[] = [];

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

      if (files.length === 0) continue;
      files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
      reports.push({
        company: companyEntry.name,
        reportType: typeEntry.name,
        files,
      });
    }
  }

  reports.sort((a, b) => {
    const byCompany = naturalCompare(a.company, b.company);
    if (byCompany !== 0) return byCompany;
    return naturalCompare(a.reportType, b.reportType);
  });

  return NextResponse.json({ root, reports });
}
