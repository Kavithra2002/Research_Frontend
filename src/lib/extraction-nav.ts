/**
 * After a Test Here extraction finishes, send the user to the page that
 * shows that data and pre-select the company in the dropdown.
 */

export function companySlugFromName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
}

/** Extracted Tables (home) — Run Annual / Quarter / selected all */
export function extractedTablesHref(companySlug: string): string {
  const qs = new URLSearchParams({ company: companySlug });
  return `/?${qs.toString()}`;
}

/** DB page — Run DB Annual / Quarter / selected all */
export function dbPageHref(companySlug: string): string {
  const qs = new URLSearchParams({ company: companySlug });
  return `/db?${qs.toString()}`;
}

export type ExtractionDestination = "extracted" | "db";

export function hrefForExtractionMode(
  mode: string,
  companySlug: string,
): string | null {
  if (!companySlug) return null;
  if (mode === "db-annual" || mode === "db-quarterly" || mode === "db-all") {
    return dbPageHref(companySlug);
  }
  if (mode === "annual" || mode === "quarterly" || mode === "all") {
    return extractedTablesHref(companySlug);
  }
  return null;
}
