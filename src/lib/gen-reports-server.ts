import fs from "node:fs/promises";
import path from "node:path";

/* ────────────────────────────────────────────────────────────────────────── *
 * Server-side store for agent-generated summary reports.
 *
 * Each report is persisted as a single JSON file inside a local "Gen_reports"
 * folder (next to the backend's other data folders, configurable via the
 * GEN_REPORTS_DIR env var). One file per report keeps reads/writes simple and
 * avoids clobbering when several reports are generated close together.
 * ────────────────────────────────────────────────────────────────────────── */

export interface StoredReport {
  id: string;
  agent: string;
  title: string;
  content: string;
  createdAt: number;
  companies?: string[];
  metrics?: string[];
}

/** Absolute path of the Gen_reports folder. */
export function getGenReportsDir(): string {
  const scriptRoot =
    process.env.SCRIPT_ROOT?.trim() ||
    path.resolve(process.cwd(), "..", "backend");
  const fromEnv = process.env.GEN_REPORTS_DIR?.trim();
  return fromEnv ? path.resolve(fromEnv) : path.join(scriptRoot, "Gen_reports");
}

async function ensureDir(): Promise<string> {
  const dir = getGenReportsDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Only allow ids we generate ourselves (uuid-like) to avoid path traversal. */
function isSafeId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function fileNameFor(report: { agent: string; id: string }): string {
  const safeAgent = report.agent.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeAgent}__${report.id}.json`;
}

function sanitizeStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === "string");
  return out.length > 0 ? out : undefined;
}

function parseRecord(raw: string): StoredReport | null {
  try {
    const data = JSON.parse(raw);
    if (
      !data ||
      typeof data.id !== "string" ||
      typeof data.agent !== "string" ||
      typeof data.content !== "string"
    ) {
      return null;
    }
    return {
      id: data.id,
      agent: data.agent,
      title: typeof data.title === "string" ? data.title : "Summary report",
      content: data.content,
      createdAt:
        typeof data.createdAt === "number" ? data.createdAt : Date.now(),
      companies: sanitizeStrings(data.companies),
      metrics: sanitizeStrings(data.metrics),
    };
  } catch {
    return null;
  }
}

/** List stored reports, newest first; optionally filtered by agent. */
export async function listStoredReports(
  agent?: string,
): Promise<StoredReport[]> {
  const dir = await ensureDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const reports: StoredReport[] = [];
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      const record = parseRecord(raw);
      if (!record) continue;
      if (agent && record.agent !== agent) continue;
      reports.push(record);
    } catch {
      // skip unreadable files
    }
  }

  reports.sort((a, b) => b.createdAt - a.createdAt);
  return reports;
}

export async function getStoredReport(
  id: string,
): Promise<StoredReport | null> {
  if (!isSafeId(id)) return null;
  const all = await listStoredReports();
  return all.find((r) => r.id === id) ?? null;
}

function deriveTitle(content: string, fallback: string): string {
  const firstLine =
    content
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  const clean = firstLine
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/[|`]/g, "")
    .trim();
  if (!clean) return fallback;
  return clean.length > 70 ? `${clean.slice(0, 70)}…` : clean;
}

export async function saveStoredReport(input: {
  agent: string;
  content: string;
  title?: string;
  companies?: string[];
  metrics?: string[];
}): Promise<StoredReport> {
  const dir = await ensureDir();
  const companies = sanitizeStrings(input.companies);
  const fallback =
    companies && companies.length > 0
      ? `Summary · ${companies.join(", ")}`
      : "Summary report";
  const report: StoredReport = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    agent: input.agent.replace(/[^a-zA-Z0-9_-]/g, "_") || "agent",
    title: input.title?.trim() || deriveTitle(input.content, fallback),
    content: input.content,
    createdAt: Date.now(),
    companies,
    metrics: sanitizeStrings(input.metrics),
  };
  await fs.writeFile(
    path.join(dir, fileNameFor(report)),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  return report;
}

export async function deleteStoredReport(id: string): Promise<boolean> {
  if (!isSafeId(id)) return false;
  const dir = await ensureDir();
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return false;
  }
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".json")) continue;
    if (!name.includes(id)) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      const record = parseRecord(raw);
      if (record?.id === id) {
        await fs.unlink(path.join(dir, name));
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}
