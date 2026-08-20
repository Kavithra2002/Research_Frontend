/**
 * Parse a same-origin API response as JSON.
 * Next/Turbopack on Windows can briefly (or after a restart) serve the HTML
 * 404 page for nested `/api/...` routes; retry instead of throwing
 * `Unexpected token '<'`.
 */
export async function fetchApiJson<T>(
  url: string,
  init?: RequestInit,
  attempts = 4,
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { cache: "no-store", ...init });
    const text = await res.text();
    const trimmed = text.trimStart();
    const looksLikeHtml =
      trimmed.startsWith("<") ||
      trimmed.toLowerCase().startsWith("<!doctype");

    if (looksLikeHtml) {
      lastError = new Error(
        i < attempts - 1
          ? "Dev API is still compiling; retrying…"
          : "Could not load data (the server returned a web page instead of JSON). Restart the frontend after the backend is up.",
      );
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      continue;
    }

    let json: T & { error?: string };
    try {
      json = JSON.parse(text) as T & { error?: string };
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : "Invalid JSON from API",
      );
    }

    if (!res.ok) {
      throw new Error(json.error ?? `Request failed (${res.status})`);
    }
    return json;
  }

  throw lastError ?? new Error("Could not load data");
}
