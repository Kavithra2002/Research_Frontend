import path from "node:path";

export function getScriptRoot() {
  const fromEnv = process.env.SCRIPT_ROOT;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
  return path.resolve(process.cwd(), "..", "backend");
}

export function getExtractedRoot() {
  const fromEnv = process.env.EXTRACTED_JSON_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
  return path.resolve(getScriptRoot(), "testing");
}

export function isSafeSegment(segment: string) {
  if (!segment) return false;
  if (segment.includes("\0")) return false;
  if (segment === "." || segment === "..") return false;
  if (segment.includes("/") || segment.includes("\\")) return false;
  return true;
}

export function resolveCompanyDir(extractedRoot: string, company: string) {
  const companyDir = path.resolve(extractedRoot, company);
  if (
    !companyDir.startsWith(extractedRoot + path.sep) &&
    companyDir !== extractedRoot
  ) {
    return null;
  }
  return companyDir;
}
