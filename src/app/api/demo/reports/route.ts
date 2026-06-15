import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DemoFile = {
  name: string;
  relPath: string;
  size: number;
  modifiedAt: string;
};

export type DemoGroup = {
  group: string;
  files: DemoFile[];
};

export type DemoCompany = {
  name: string;
  displayName: string;
  annual: DemoGroup[];
  quarterly: DemoGroup[];
  totalFiles: number;
};

/** Resolve <backend>/Demo_Data the same way the storage lib resolves backend. */
function getDemoRoot(): string {
  const scriptRoot =
    process.env.SCRIPT_ROOT?.trim() ||
    path.resolve(process.cwd(), "..", "backend");
  const fromEnv = process.env.DEMO_DATA_DIR?.trim();
  return fromEnv ? path.resolve(fromEnv) : path.join(scriptRoot, "Demo_Data");
}

function naturalCompare(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function prettify(name: string) {
  return name.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

async function safeReaddir(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function toRelPath(root: string, abs: string) {
  return path.relative(root, abs).split(path.sep).join("/");
}

async function listPdfFiles(
  root: string,
  dir: string,
): Promise<DemoFile[]> {
  const entries = await safeReaddir(dir);
  const files: DemoFile[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    if (!e.name.toLowerCase().endsWith(".pdf")) continue;
    const abs = path.join(dir, e.name);
    try {
      const st = await fs.stat(abs);
      files.push({
        name: e.name,
        relPath: toRelPath(root, abs),
        size: st.size,
        modifiedAt: st.mtime.toISOString(),
      });
    } catch {
      /* ignore */
    }
  }
  files.sort((a, b) => naturalCompare(a.name, b.name));
  return files;
}

/**
 * List the report groups for one report-type folder. Handles BOTH layouts:
 *   <type>/<group folder>/<file>.pdf      (e.g. "Annual Report 2024/x.pdf")
 *   <type>/<file>.pdf                      (flat — no group folder)
 */
async function listGroups(root: string, typeDir: string): Promise<DemoGroup[]> {
  const groups: DemoGroup[] = [];
  const entries = await safeReaddir(typeDir);

  // Nested: each sub-directory is a report group.
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const files = await listPdfFiles(root, path.join(typeDir, e.name));
    if (files.length > 0) groups.push({ group: e.name, files });
  }

  // Flat: PDFs living directly inside the report-type folder.
  const flatFiles = await listPdfFiles(root, typeDir);
  if (flatFiles.length > 0) {
    groups.push({ group: "", files: flatFiles });
  }

  groups.sort((a, b) => naturalCompare(b.group, a.group)); // newest year first
  return groups;
}

function matchTypeDir(dirNames: string[], wanted: "annual" | "quarterly") {
  return dirNames.find((d) => d.trim().toLowerCase() === wanted) ?? null;
}

export async function GET() {
  const root = getDemoRoot();

  let rootEntries;
  try {
    rootEntries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Demo_Data directory could not be read: ${root}`,
        details: error instanceof Error ? error.message : String(error),
        companies: [],
      },
      { status: 200 }, // soft error so the page renders an empty state
    );
  }

  const companies: DemoCompany[] = [];

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;
    const companyName = entry.name;
    const companyDir = path.join(root, companyName);

    const typeEntries = await safeReaddir(companyDir);
    const typeDirNames = typeEntries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    const annualName = matchTypeDir(typeDirNames, "annual");
    const quarterlyName = matchTypeDir(typeDirNames, "quarterly");

    const annual = annualName
      ? await listGroups(root, path.join(companyDir, annualName))
      : [];
    const quarterly = quarterlyName
      ? await listGroups(root, path.join(companyDir, quarterlyName))
      : [];

    const totalFiles =
      annual.reduce((n, g) => n + g.files.length, 0) +
      quarterly.reduce((n, g) => n + g.files.length, 0);

    if (totalFiles === 0) continue;

    companies.push({
      name: companyName,
      displayName: prettify(companyName),
      annual,
      quarterly,
      totalFiles,
    });
  }

  companies.sort((a, b) => naturalCompare(a.displayName, b.displayName));

  return NextResponse.json({ root, companies });
}
