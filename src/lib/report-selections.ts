import { api } from "./api";

export interface ReportSelection {
  _id: string;
  company: string;
  report_type: string;
  file_name: string;
  selected_by: string | null;
  selected_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SelectionItem {
  company: string;
  report_type: string;
  file_name: string;
}

export interface ListSelectionsResponse {
  items: ReportSelection[];
}

export interface ReplaceSelectionsResponse {
  selections: ReportSelection[];
  added: number;
  removed: number;
}

export function selectionKey(item: SelectionItem): string {
  return `${item.company}::${item.report_type}::${item.file_name}`;
}

export async function listReportSelections(signal?: AbortSignal) {
  return api<ListSelectionsResponse>("/report-selections", {
    signal,
    cache: "no-store",
  });
}

export async function replaceReportSelections(
  items: SelectionItem[],
  signal?: AbortSignal,
) {
  return api<ReplaceSelectionsResponse>("/report-selections", {
    method: "PUT",
    body: { items },
    signal,
  });
}

export async function addReportSelection(item: SelectionItem) {
  return api<ReportSelection>("/report-selections", {
    method: "POST",
    body: item,
  });
}

export async function removeReportSelection(item: SelectionItem) {
  return api<{ removed: boolean }>("/report-selections/item", {
    method: "DELETE",
    body: item,
  });
}

export async function clearReportSelections() {
  return api<{ removed: number }>("/report-selections", {
    method: "DELETE",
  });
}
