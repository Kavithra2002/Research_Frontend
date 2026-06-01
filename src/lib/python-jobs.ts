/**
 * URL for long-running Python NDJSON streams (scan / extract).
 *
 * In production the browser calls Render directly (NEXT_PUBLIC_API_BASE_URL).
 * Proxying through Vercel's `/api/system/*` routes hits serverless timeouts.
 *
 * System routes do not use auth cookies — callers must use `credentials: "omit"`.
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
  return `${base}${route.replace(/^\/api/, "")}`;
}

/** fetch() options for Python NDJSON streams (no cookies — avoids CORS credential issues). */
export const PYTHON_JOB_FETCH_INIT = {
  cache: "no-store" as const,
  credentials: "omit" as const,
};
