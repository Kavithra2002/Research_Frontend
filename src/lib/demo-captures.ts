import { listDirectory } from "@/lib/storage";

export type CapturePeriod = "Annual" | "Quarterly";

/**
 * Mirror of the Python `_sanitize_company_key` used by the extraction pipeline
 * so a Demo_Data_captures display folder ("Ambeon Holdings PLC") can be matched
 * to the MongoDB company slug ("Ambeon_Holdings_PLC").
 */
export function sanitizeCompanyKey(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
}

export function normalizeCapturePeriod(raw: string | null): CapturePeriod {
  if (!raw) return "Annual";
  const t = raw.trim().toLowerCase();
  if (t === "quarterly" || t === "quarter" || t === "interim" || t === "q") {
    return "Quarterly";
  }
  return "Annual";
}

/**
 * Resolve the actual on-disk Demo_Data_captures top-level folder name for a
 * company identifier coming from the UI (which is the MongoDB slug, e.g.
 * "Ambeon_Holdings_PLC"). Returns the display-name folder ("Ambeon Holdings
 * PLC") when found, otherwise null.
 */
export async function resolveDemoCaptureCompanyDir(
  company: string,
): Promise<string | null> {
  const { directories } = await listDirectory("demo_captures");
  if (directories.length === 0) return null;

  // 1. Exact match (company passed as display name).
  if (directories.includes(company)) return company;

  // 2. Match by sanitized slug.
  const target = company.toLowerCase();
  for (const dir of directories) {
    if (sanitizeCompanyKey(dir).toLowerCase() === target) {
      return dir;
    }
  }
  return null;
}
