import { api, API_BASE_URL, ApiError } from "./api";

/* ────────────────────────────────────────────────────────────────────────── *
 * Marian — Daily Market Wrap agent (configuration + reports + chat).
 * ────────────────────────────────────────────────────────────────────────── */

export type MarianMessageRole = "user" | "assistant";

export interface MarianMessage {
  role: MarianMessageRole;
  content: string;
}

export interface MarianToolEvent {
  tool: string;
  arguments: unknown;
  result: unknown;
  ok: boolean;
  error?: string;
}

export interface MarianChatResponse {
  reply: string;
  tool_events: MarianToolEvent[];
}

export async function sendMarianChat(
  messages: MarianMessage[],
  signal?: AbortSignal,
): Promise<MarianChatResponse> {
  return api<MarianChatResponse>("/ai/marian/chat", {
    method: "POST",
    body: { messages },
    signal,
  });
}

export type MarianSectionKind = "table" | "chart";
export type MarianCoverage = "full" | "partial" | "derived";

export interface MarianSection {
  id: string;
  label: string;
  kind: MarianSectionKind;
  coverage: MarianCoverage;
}

export interface MarianConfig {
  sections: string[];
  enabled: boolean;
}

export interface MarianReport {
  id: string;
  content: string;
  sections: string[];
  source: "scheduled" | "manual";
  created_at: string;
}

export async function getMarianSections(
  signal?: AbortSignal,
): Promise<MarianSection[]> {
  const res = await api<{ sections: MarianSection[] }>("/ai/marian/sections", {
    signal,
  });
  return res.sections;
}

export async function getMarianConfig(
  signal?: AbortSignal,
): Promise<MarianConfig | null> {
  const res = await api<{ config: MarianConfig | null }>("/ai/marian/config", {
    signal,
  });
  return res.config;
}

export async function saveMarianConfig(
  sections: string[],
  enabled: boolean,
): Promise<MarianConfig> {
  const res = await api<{ config: MarianConfig }>("/ai/marian/config", {
    method: "PUT",
    body: { sections, enabled },
  });
  return res.config;
}

export async function deleteMarianConfig(): Promise<void> {
  await api("/ai/marian/config", { method: "DELETE" });
}

export async function generateMarianReport(
  sections: string[],
  save = false,
  signal?: AbortSignal,
): Promise<{ report: string; sections: string[]; unavailable: string[] }> {
  return api<{ report: string; sections: string[]; unavailable: string[] }>(
    "/ai/marian/report",
    {
      method: "POST",
      body: { sections, save },
      signal,
    },
  );
}

export async function listMarianReports(
  signal?: AbortSignal,
): Promise<MarianReport[]> {
  const res = await api<{ reports: MarianReport[] }>("/ai/marian/reports", {
    signal,
  });
  return res.reports;
}

/** Structured market dataset used to render the Daily Market Wrap replica PDF. */
export interface MarianDataset {
  sections: string[];
  asOf: string;
  data: Record<string, unknown>;
  unavailable: string[];
}

export async function getMarianData(
  sections: string[],
  signal?: AbortSignal,
): Promise<MarianDataset> {
  return api<MarianDataset>("/ai/marian/data", {
    method: "POST",
    body: { sections },
    signal,
  });
}

/**
 * Fetch the server-rendered Daily Market Wrap PDF (the exact file the scheduled
 * email attaches) and trigger a browser download. Returns the unavailable
 * section ids so the panel can show its caveat note.
 */
export async function downloadMarianReportPdf(
  sections: string[],
  signal?: AbortSignal,
): Promise<{ unavailable: string[] }> {
  // The dataset (cheap, JSON) gives us the unavailable note; the PDF is binary.
  const dataset = await getMarianData(sections, signal);

  const res = await fetch(`${API_BASE_URL}/ai/marian/report-pdf`, {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json", Accept: "application/pdf" },
    body: JSON.stringify({ sections }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, `Failed to build report PDF (${res.status})`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daily-market-wrap-${date}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { unavailable: dataset.unavailable ?? [] };
}
