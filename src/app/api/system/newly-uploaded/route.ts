import { NextRequest, NextResponse } from "next/server";
import path from "node:path";

import {
  deleteFile,
  getLocalRoot,
  isR2Storage,
  isSafeSegment,
  listDirectory,
  statFile,
} from "@/lib/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type UploadedFile = {
  name: string;
  size: number;
  modifiedAt: string;
};

export type SelectionItem = {
  company: string;
  report_type: string;
  file_name: string;
};

const itemSchema = {
  parse(items: unknown): SelectionItem[] {
    if (!Array.isArray(items)) return [];
    const result: SelectionItem[] = [];
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const company = typeof o.company === "string" ? o.company.trim() : "";
      const report_type =
        typeof o.report_type === "string" ? o.report_type.trim() : "";
      const file_name =
        typeof o.file_name === "string" ? o.file_name.trim() : "";
      if (!company || !report_type || !file_name) continue;
      if (![company, report_type, file_name].every(isSafeSegment)) continue;
      const ext = path.extname(file_name).toLowerCase();
      if (ext !== ".pdf") continue;
      result.push({ company, report_type, file_name });
    }
    return result;
  },
};

async function deleteReportFile(item: SelectionItem): Promise<boolean> {
  const { company, report_type, file_name } = item;

  let stat = await statFile(UPDATED_REPORTS_ROOT, company, report_type, file_name);
  let root: typeof UPDATED_REPORTS_ROOT | typeof LEGACY_ROOT = UPDATED_REPORTS_ROOT;
  if (!stat) {
    stat = await statFile(LEGACY_ROOT, company, report_type, file_name);
    root = LEGACY_ROOT;
  }
  if (!stat) return false;

  return deleteFile(root, company, report_type, file_name);
}

export type UploadedReport = {
  company: string;
  reportType: string;
  files: UploadedFile[];
};

export type DeleteReportsResponse = {
  deleted: number;
  notFound: number;
  failed: number;
  deletedItems?: SelectionItem[];
  error?: string;
};

/** Primary R2/local prefix for newly scanned reports. */
const UPDATED_REPORTS_ROOT = "updated_reports" as const;
/** Legacy prefix (local dev / older uploads). */
const LEGACY_ROOT = "newly_uploaded_report" as const;

const ALLOWED_EXTENSIONS = new Set([".pdf"]);

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

export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { items?: unknown };
    const items = itemSchema.parse(body.items);
    if (items.length === 0) {
      return NextResponse.json(
        { error: "No valid reports to delete", deleted: 0, notFound: 0, failed: 0 },
        { status: 400 },
      );
    }

    let deleted = 0;
    let notFound = 0;
    let failed = 0;
    const deletedItems: SelectionItem[] = [];

    for (const item of items) {
      const stat =
        (await statFile(UPDATED_REPORTS_ROOT, item.company, item.report_type, item.file_name)) ??
        (await statFile(LEGACY_ROOT, item.company, item.report_type, item.file_name));
      if (!stat) {
        notFound += 1;
        continue;
      }
      const ok = await deleteReportFile(item);
      if (ok) {
        deleted += 1;
        deletedItems.push(item);
      } else {
        failed += 1;
      }
    }

    return NextResponse.json({
      deleted,
      notFound,
      failed,
      deletedItems,
    } satisfies DeleteReportsResponse);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        deleted: 0,
        notFound: 0,
        failed: 0,
      } satisfies DeleteReportsResponse,
      { status: 500 },
    );
  }
}
