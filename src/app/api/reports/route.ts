import { NextResponse } from "next/server";

import {
  formatReportDisplayName,
  parseReportPeriodFromFileName,
  reportSortKey,
  type ReportNameMeta,
} from "@/lib/report-display-name";
import { getLocalRoot, isR2Storage, listDirectory, readUtf8 } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ReportFile = {
  name: string;
  size: number;
  modifiedAt: string;
  /** User-facing label, e.g. "Annual report 2025" / "Quarter 01 - 2016". */
  displayName: string;
  year: number | null;
  quarter: number | null;
};

export type CompanyReports = {
  name: string;
  reportTypes: Record<string, ReportFile[]>;
  totalReports: number;
};

const ALLOWED_EXTENSIONS = new Set([".pdf"]);

type IndexFileMeta = {
  year?: number | null;
  quarter?: number | null;
  label?: string | null;
  kind?: string | null;
};

type CompanyIndex = {
  files?: Record<string, IndexFileMeta>;
};

type ListedPdf = {
  /** Path relative to the report-type folder (may include a group subfolder). */
  name: string;
  size: number;
  modifiedAt: string;
  group: string;
};

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function loadCompanyIndex(
  companyName: string,
): Promise<Record<string, IndexFileMeta>> {
  try {
    const raw = await readUtf8("reports", companyName, "index.json");
    const parsed = JSON.parse(raw) as CompanyIndex;
    return parsed.files && typeof parsed.files === "object" ? parsed.files : {};
  } catch {
    return {};
  }
}

/**
 * Collect PDFs under a report-type folder. Supports Demo_Data layout:
 *   <type>/<group>/<file>.pdf   (e.g. Annual/Annual Report 2025/x.pdf)
 *   <type>/<file>.pdf           (flat — legacy reports/ layout)
 */
async function listTypePdfs(
  companyName: string,
  typeName: string,
): Promise<ListedPdf[]> {
  const typeLevel = await listDirectory("reports", companyName, typeName);
  const files: ListedPdf[] = [];

  for (const group of typeLevel.directories) {
    const groupLevel = await listDirectory(
      "reports",
      companyName,
      typeName,
      group,
    );
    for (const f of groupLevel.files) {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;
      files.push({
        name: `${group}/${f.name}`,
        size: f.size,
        modifiedAt: f.modifiedAt,
        group,
      });
    }
  }

  for (const f of typeLevel.files) {
    const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;
    files.push({
      name: f.name,
      size: f.size,
      modifiedAt: f.modifiedAt,
      group: "",
    });
  }

  return files;
}

function enrichFile(
  file: ListedPdf,
  reportType: string,
  index: Record<string, IndexFileMeta>,
  groupSiblingCount: number,
): ReportFile {
  const fromIndex = index[file.name] ?? index[file.name.split("/").pop() ?? ""];
  const basename = file.name.includes("/")
    ? (file.name.split("/").pop() ?? file.name)
    : file.name;
  // Prefer period hints from the Demo_Data group folder name
  // ("Annual Report 2025", "Quarterly Report 2016 Q1").
  const fromGroup = file.group
    ? parseReportPeriodFromFileName(file.group)
    : { year: null, quarter: null };
  const parsed = parseReportPeriodFromFileName(basename);
  const label =
    fromIndex?.label ??
    (file.group
      ? groupSiblingCount > 1
        ? `${file.group} — ${basename.replace(/\.pdf$/i, "")}`
        : file.group
      : null);
  const meta: ReportNameMeta = {
    year: fromIndex?.year ?? fromGroup.year ?? parsed.year,
    quarter: fromIndex?.quarter ?? fromGroup.quarter ?? parsed.quarter,
    label,
  };
  return {
    name: file.name,
    size: file.size,
    modifiedAt: file.modifiedAt,
    year: meta.year ?? null,
    quarter: meta.quarter ?? null,
    displayName: formatReportDisplayName(basename, reportType, meta),
  };
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
    const index = await loadCompanyIndex(companyName);
    const reportTypes: Record<string, ReportFile[]> = {};
    let totalReports = 0;

    for (const typeName of typeLevel.directories) {
      // Skip non-report folders that may sit next to Annual/Quarterly.
      if (!/^(annual|quarterly)$/i.test(typeName.trim())) continue;

      const listed = await listTypePdfs(companyName, typeName);
      const groupCounts = new Map<string, number>();
      for (const f of listed) {
        if (!f.group) continue;
        groupCounts.set(f.group, (groupCounts.get(f.group) ?? 0) + 1);
      }

      const files: ReportFile[] = listed.map((f) =>
        enrichFile(f, typeName, index, groupCounts.get(f.group) ?? 0),
      );

      files.sort((a, b) => {
        const kb = reportSortKey(b.name, typeName, b);
        const ka = reportSortKey(a.name, typeName, a);
        if (kb !== ka) return kb - ka;
        return naturalCompare(a.displayName, b.displayName);
      });

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
