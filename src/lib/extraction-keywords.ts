import { api } from "./api";

export type ExtractionKeywordScope = "fs" | "drivers" | "quarterly";

export type ExtractionKeyword = {
  _id: string;
  canonical_label: string;
  aliases: string[];
  user_aliases?: string[];
  scope: ExtractionKeywordScope;
  is_new_keyword: boolean;
  is_builtin?: boolean;
  line_order?: number | null;
  created_by: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type SheetLineItem = {
  label: string;
  kind: "section" | "subsection" | "data" | "check" | string;
  source: "builtin" | "user";
  keyword_id: string | null;
  is_new_keyword: boolean;
  line_order: number | null;
  draggable: boolean;
};

export type CanonicalLabelOption = {
  label: string;
  scope: ExtractionKeywordScope;
  source: "builtin" | "user";
  alias_count: number;
  matched_alias?: string | null;
};

export async function seedExtractionKeywords() {
  return api<{ seeded: number; total: number }>("/extraction-keywords/seed", {
    method: "POST",
  });
}

export async function listExtractionKeywords(scope?: ExtractionKeywordScope) {
  const qs = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return api<{ keywords: ExtractionKeyword[] }>(
    `/extraction-keywords${qs}`,
    { cache: "no-store" },
  );
}

export async function listSheetLineOrder(scope: ExtractionKeywordScope) {
  return api<{ lines: SheetLineItem[] }>(
    `/extraction-keywords/line-order?scope=${encodeURIComponent(scope)}`,
    { cache: "no-store" },
  );
}

export async function suggestCanonicalLabels(
  q: string,
  scope?: ExtractionKeywordScope,
) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (scope) params.set("scope", scope);
  const qs = params.toString();
  return api<{ options: CanonicalLabelOption[] }>(
    `/extraction-keywords/suggest${qs ? `?${qs}` : ""}`,
    { cache: "no-store" },
  );
}

export async function addNewExtractionKeyword(input: {
  canonical_label: string;
  alias: string;
  scope: ExtractionKeywordScope;
  line_order?: number | null;
}) {
  return api<ExtractionKeyword>("/extraction-keywords/new", {
    method: "POST",
    body: input,
  });
}

export async function addSimilarExtractionKeyword(input: {
  canonical_label: string;
  similar_word: string;
  scope: ExtractionKeywordScope;
}) {
  return api<ExtractionKeyword>("/extraction-keywords/similar", {
    method: "POST",
    body: input,
  });
}

export async function deleteExtractionKeyword(id: string) {
  return api<{ removed: boolean }>(`/extraction-keywords/${id}`, {
    method: "DELETE",
  });
}

export async function reorderExtractionKeyword(id: string, lineOrder: number) {
  return api<ExtractionKeyword>(`/extraction-keywords/${id}/reorder`, {
    method: "PATCH",
    body: { line_order: lineOrder },
  });
}

export async function removeExtractionAlias(id: string, alias: string) {
  return api<ExtractionKeyword | { removed: boolean }>(
    `/extraction-keywords/${id}/remove-alias`,
    {
      method: "POST",
      body: { alias },
    },
  );
}
