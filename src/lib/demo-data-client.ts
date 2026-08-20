/** Client-safe Demo_Data path helpers (no Node built-ins). */

/** Map a stored PDF path to a relative path under Demo_Data (string heuristics only). */
export function demoPdfRelPathFromSource(sourcePdf: string): string | null {
  const rel = sourcePdf.trim().replace(/\\/g, "/");
  if (!rel || rel.includes("..")) return null;

  const lower = rel.toLowerCase();
  const markerIdx = lower.indexOf("/demo_data/");
  if (markerIdx >= 0) {
    return rel.slice(markerIdx + "/demo_data/".length);
  }

  // Already a relative Demo_Data path (no drive letter / absolute root).
  if (!rel.startsWith("/") && !/^[a-zA-Z]:/.test(rel)) {
    return rel;
  }

  return null;
}

export function buildDemoPdfViewerUrl(
  relPath: string,
  page?: number | null,
): string {
  const params = new URLSearchParams({ rel: relPath });
  const base = `/api/demo/pdf?${params.toString()}`;
  if (page != null && Number.isFinite(page) && page > 0) {
    return `${base}#page=${Math.floor(page)}`;
  }
  return base;
}
