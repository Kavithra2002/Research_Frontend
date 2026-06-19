import { api, API_BASE_URL, ApiError } from "./api";
import type { JoneGroupKind } from "./jone-market-groups";

/* ────────────────────────────────────────────────────────────────────────── *
 * Jone — Analytics / My List market-summary agent.
 * ────────────────────────────────────────────────────────────────────────── */

export type JoneMessageRole = "user" | "assistant";

export interface JoneMessage {
  role: JoneMessageRole;
  content: string;
}

export interface JoneToolEvent {
  tool: string;
  arguments: unknown;
  result: unknown;
  ok: boolean;
  error?: string;
}

export interface JoneChatResponse {
  reply: string;
  tool_events: JoneToolEvent[];
}

export async function sendJoneChat(
  messages: JoneMessage[],
  signal?: AbortSignal,
): Promise<JoneChatResponse> {
  return api<JoneChatResponse>("/ai/jone/chat", {
    method: "POST",
    body: { messages },
    signal,
  });
}

export interface JoneColumn {
  id: string;
  label: string;
}

export interface JoneConfig {
  columns: string[];
  groupKind: JoneGroupKind;
  watchlistId: string;
  watchlistName: string;
  watchlistSymbols: string[];
  enabled: boolean;
}

export interface JonePresetGroup {
  id: string;
  kind: JoneGroupKind;
  name: string;
  count: number;
}

export interface JoneReportPayload {
  groupKind: JoneGroupKind;
  watchlistId: string;
  watchlistName: string;
  watchlistSymbols: string[];
}

export async function getJoneColumns(
  signal?: AbortSignal,
): Promise<JoneColumn[]> {
  const res = await api<{ columns: JoneColumn[] }>("/ai/jone/columns", {
    signal,
  });
  return res.columns;
}

export async function getJonePresetGroups(
  signal?: AbortSignal,
): Promise<JonePresetGroup[]> {
  const res = await api<{ presets: JonePresetGroup[] }>("/ai/jone/groups", {
    signal,
  });
  return res.presets;
}

export async function getJoneConfig(
  signal?: AbortSignal,
): Promise<JoneConfig | null> {
  const res = await api<{ config: JoneConfig | null }>("/ai/jone/config", {
    signal,
  });
  return res.config;
}

export async function saveJoneConfig(input: {
  columns: string[];
  groupKind: JoneGroupKind;
  watchlistId: string;
  watchlistName: string;
  watchlistSymbols: string[];
  enabled?: boolean;
}): Promise<JoneConfig> {
  const res = await api<{ config: JoneConfig }>("/ai/jone/config", {
    method: "PUT",
    body: {
      columns: input.columns,
      groupKind: input.groupKind,
      watchlistId: input.watchlistId,
      watchlistName: input.watchlistName,
      watchlistSymbols: input.watchlistSymbols,
      enabled: input.enabled ?? true,
    },
  });
  return res.config;
}

export async function deleteJoneConfig(): Promise<void> {
  await api("/ai/jone/config", { method: "DELETE" });
}

async function downloadJoneReport(
  path: "report-pdf" | "report-csv",
  input: JoneReportPayload,
  signal?: AbortSignal,
): Promise<Blob> {
  const accept = path === "report-pdf" ? "application/pdf" : "text/csv";
  const res = await fetch(`${API_BASE_URL}/ai/jone/${path}`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json", Accept: accept },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new ApiError(res.status, `Failed to build report (${res.status})`);
  }
  return res.blob();
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadJoneReportPdf(
  input: JoneReportPayload,
  signal?: AbortSignal,
): Promise<void> {
  const blob = await downloadJoneReport("report-pdf", input, signal);
  const date = new Date().toISOString().slice(0, 10);
  const safeName = input.watchlistName.replace(/[^a-z0-9-_]+/gi, "_");
  triggerDownload(blob, `${safeName}_trade_summary_${date}.pdf`);
}

export async function downloadJoneReportCsv(
  input: JoneReportPayload,
  signal?: AbortSignal,
): Promise<void> {
  const blob = await downloadJoneReport("report-csv", input, signal);
  const date = new Date().toISOString().slice(0, 10);
  const safeName = input.watchlistName.replace(/[^a-z0-9-_]+/gi, "_");
  triggerDownload(blob, `${safeName}_trade_summary_${date}.csv`);
}
