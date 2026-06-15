import { api } from "./api";

export type RobinMessageRole = "user" | "assistant";

export interface RobinMessage {
  role: RobinMessageRole;
  content: string;
}

export interface RobinToolEvent {
  tool: string;
  arguments: unknown;
  result: unknown;
  ok: boolean;
  error?: string;
}

export interface RobinChatResponse {
  reply: string;
  tool_events: RobinToolEvent[];
}

export async function sendRobinChat(
  messages: RobinMessage[],
  signal?: AbortSignal,
): Promise<RobinChatResponse> {
  return api<RobinChatResponse>("/ai/robin/chat", {
    method: "POST",
    body: { messages },
    signal,
  });
}

/* ── Robin configuration: demo companies + metrics + report ─────────────── */

export interface DemoCompany {
  name: string;
  reportCount: number;
}

export interface RobinMetric {
  id: string;
  label: string;
  enabled: boolean;
}

export interface RobinConfigResponse {
  companies: DemoCompany[];
  metrics: RobinMetric[];
}

export interface RobinReportResponse {
  report: string;
  usedWebSearch: boolean;
  /** True when the report was anchored on live CSE (Colombo Stock Exchange) data. */
  usedCse: boolean;
  companies: string[];
  metrics: string[];
}

export async function getRobinConfig(
  signal?: AbortSignal,
): Promise<RobinConfigResponse> {
  return api<RobinConfigResponse>("/ai/robin/companies", { signal });
}

export async function generateRobinReport(
  companies: string[],
  metrics: string[],
  signal?: AbortSignal,
): Promise<RobinReportResponse> {
  return api<RobinReportResponse>("/ai/robin/report", {
    method: "POST",
    body: { companies, metrics },
    signal,
  });
}
