import path from "node:path";

export type StorageRoot =
  | "reports"
  | "newly_uploaded_report"
  | "updated_reports"
  | "testing"
  | "company";

export function isR2Storage(): boolean {
  const driver = (process.env.STORAGE_DRIVER ?? "local").trim().toLowerCase();
  return driver === "r2" || driver === "s3";
}

function resolveEnvPath(key: string, fallback: string): string {
  const fromEnv = process.env[key];
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv.trim());
  }
  return path.resolve(fallback);
}

export function getLocalRoot(root: StorageRoot): string {
  const scriptRoot =
    process.env.SCRIPT_ROOT?.trim() ||
    path.resolve(process.cwd(), "..", "backend");

  switch (root) {
    case "reports":
      return resolveEnvPath("REPORTS_DIR", path.join(scriptRoot, "reports"));
    case "newly_uploaded_report":
      return resolveEnvPath(
        "NEWLY_UPLOADED_DIR",
        path.join(scriptRoot, "newly_uploaded_report"),
      );
    case "updated_reports":
      return resolveEnvPath(
        "UPDATED_REPORTS_DIR",
        path.join(scriptRoot, "updated_reports"),
      );
    case "testing":
      return resolveEnvPath(
        "EXTRACTED_JSON_DIR",
        path.join(scriptRoot, "testing"),
      );
    case "company":
      return resolveEnvPath("COMPANY_DIR", path.join(scriptRoot, "COMPANY"));
    default:
      return scriptRoot;
  }
}

export function toStorageKey(root: StorageRoot, ...segments: string[]): string {
  const parts = [root, ...segments].filter((s) => s.length > 0);
  return parts.join("/");
}

export function isSafeSegment(segment: string): boolean {
  if (!segment) return false;
  if (segment.includes("\0")) return false;
  if (segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\")) return false;
  return true;
}
