/**
 * URL for long-running Python NDJSON streams (scan / extract).
 *
 * In production the browser calls Render directly. Proxying through Vercel's
 * `/api/system/*` routes hits serverless timeouts (often 10–60s) while
 * extraction can run for many minutes.
 */
export function getPythonJobUrl(apiPath: string): string {
  const normalized = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  const route = normalized.startsWith("/api") ? normalized : `/api${normalized}`;

  if (typeof window === "undefined") {
    return route;
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!apiBase) {
    return route;
  }

  const base = apiBase.replace(/\/+$/, "");
  const suffix = route.replace(/^\/api/, "");
  return `${base}${suffix}`;
}
