/** Server-side base URL for the Express API (no trailing slash on `/api`). */
export function getBackendApiBase(): string {
  const raw =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "http://localhost:4000/api";
  return raw.replace(/\/+$/, "");
}

export async function fetchBackend(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = getBackendApiBase();
  const url = path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
  return fetch(url, { ...init, cache: "no-store" });
}
