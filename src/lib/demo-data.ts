import path from "node:path";

/** Resolve `<backend>/Demo_Data` (same convention as demo reports API). */
export function getDemoDataRoot(): string {
  const scriptRoot =
    process.env.SCRIPT_ROOT?.trim() ||
    path.resolve(process.cwd(), "..", "backend");
  const fromEnv = process.env.DEMO_DATA_DIR?.trim();
  return fromEnv ? path.resolve(fromEnv) : path.join(scriptRoot, "Demo_Data");
}

/** Map an absolute or relative stored PDF path to a safe path under Demo_Data. */
export function demoPdfRelPathFromSource(sourcePdf: string): string | null {
  const rel = sourcePdf.trim().replace(/\\/g, "/");
  if (!rel || rel.includes("..")) return null;

  const lower = rel.toLowerCase();
  const markerIdx = lower.indexOf("/demo_data/");
  if (markerIdx >= 0) {
    return rel.slice(markerIdx + "/demo_data/".length);
  }

  const root = path.resolve(getDemoDataRoot());
  const abs = path.isAbsolute(rel) ? path.resolve(rel) : path.resolve(root, rel);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!abs.startsWith(rootPrefix) && abs !== root) return null;
  return path.relative(root, abs).split(path.sep).join("/");
}

export function resolveDemoPdfAbsPath(relPath: string): string | null {
  const rel = relPath.trim().replace(/\\/g, "/");
  if (!rel || rel.includes("..")) return null;
  if (!rel.toLowerCase().endsWith(".pdf")) return null;

  const root = path.resolve(getDemoDataRoot());
  const abs = path.resolve(root, rel);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!abs.startsWith(rootPrefix) && abs !== root) return null;
  return abs;
}

export function buildDemoPdfViewerUrl(relPath: string, page?: number | null): string {
  const params = new URLSearchParams({ rel: relPath });
  const base = `/api/demo/pdf?${params.toString()}`;
  if (page != null && Number.isFinite(page) && page > 0) {
    return `${base}#page=${Math.floor(page)}`;
  }
  return base;
}
