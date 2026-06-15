import { api } from "./api";

/* ────────────────────────────────────────────────────────────────────────── *
 * Tuck — daily CSE market-announcement agent (configuration + reports + chat).
 * ────────────────────────────────────────────────────────────────────────── */

export type TuckMessageRole = "user" | "assistant";

export interface TuckMessage {
  role: TuckMessageRole;
  content: string;
}

export interface TuckToolEvent {
  tool: string;
  arguments: unknown;
  result: unknown;
  ok: boolean;
  error?: string;
}

export interface TuckChatResponse {
  reply: string;
  tool_events: TuckToolEvent[];
}

export async function sendTuckChat(
  messages: TuckMessage[],
  signal?: AbortSignal,
): Promise<TuckChatResponse> {
  return api<TuckChatResponse>("/ai/tuck/chat", {
    method: "POST",
    body: { messages },
    signal,
  });
}

export interface TuckSection {
  id: string;
  label: string;
}

export interface TuckConfig {
  sections: string[];
  companies: string[];
  enabled: boolean;
}

export interface TuckReport {
  id: string;
  content: string;
  sections: string[];
  source: "scheduled" | "manual";
  created_at: string;
}

export async function getTuckSections(
  signal?: AbortSignal,
): Promise<TuckSection[]> {
  const res = await api<{ sections: TuckSection[] }>("/ai/tuck/sections", {
    signal,
  });
  return res.sections;
}

export async function getTuckConfig(
  signal?: AbortSignal,
): Promise<TuckConfig | null> {
  const res = await api<{ config: TuckConfig | null }>("/ai/tuck/config", {
    signal,
  });
  return res.config;
}

export async function saveTuckConfig(
  sections: string[],
  companies: string[],
  enabled: boolean,
): Promise<TuckConfig> {
  const res = await api<{ config: TuckConfig }>("/ai/tuck/config", {
    method: "PUT",
    body: { sections, companies, enabled },
  });
  return res.config;
}

export async function deleteTuckConfig(): Promise<void> {
  await api("/ai/tuck/config", { method: "DELETE" });
}

export async function generateTuckReport(
  sections: string[],
  companies: string[],
  save = false,
  signal?: AbortSignal,
): Promise<{ report: string; sections: string[] }> {
  return api<{ report: string; sections: string[] }>("/ai/tuck/report", {
    method: "POST",
    body: { sections, companies, save },
    signal,
  });
}

export async function listTuckReports(
  signal?: AbortSignal,
): Promise<TuckReport[]> {
  const res = await api<{ reports: TuckReport[] }>("/ai/tuck/reports", {
    signal,
  });
  return res.reports;
}
