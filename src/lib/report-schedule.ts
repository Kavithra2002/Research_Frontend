import { api } from "./api";
import type { ReportFrequency } from "./email-recipients";

/* ────────────────────────────────────────────────────────────────────────── *
 * Server-side report schedules — persist when (time/date/frequency) and to whom
 * (emails) a Robin/Tuck report should be generated and emailed. The backend
 * scheduler runs the due ones automatically.
 * ────────────────────────────────────────────────────────────────────────── */

export type ScheduleAgent = "robin" | "tuck" | "marian";

export interface ReportSchedulePayload {
  time: string;
  date: string;
  frequency: ReportFrequency;
  emails: string[];
  /** Agent config snapshot: robin → {companies, metrics}; tuck → {sections, companies}. */
  config: Record<string, unknown>;
  enabled?: boolean;
}

export interface SavedReportSchedule {
  agent: ScheduleAgent;
  time: string;
  date: string;
  frequency: ReportFrequency;
  emails: string[];
  config: Record<string, unknown>;
  enabled: boolean;
  lastRunAt: string | null;
}

/**
 * Load the persisted schedule + config snapshot for an agent. Returns `null`
 * when the user has never saved a configuration for this agent. Used to
 * pre-fill the configuration panel with the previously chosen companies/metrics.
 */
export async function getReportScheduleFromServer(
  agent: ScheduleAgent,
  signal?: AbortSignal,
): Promise<SavedReportSchedule | null> {
  const res = await api<{ schedule: SavedReportSchedule | null }>(
    `/ai/report-schedule/${agent}`,
    { signal },
  );
  return res.schedule ?? null;
}

export async function saveReportScheduleToServer(
  agent: ScheduleAgent,
  payload: ReportSchedulePayload,
): Promise<void> {
  await api(`/ai/report-schedule/${agent}`, {
    method: "PUT",
    body: payload,
  });
}

export async function deleteReportScheduleFromServer(
  agent: ScheduleAgent,
): Promise<void> {
  await api(`/ai/report-schedule/${agent}`, { method: "DELETE" });
}

/**
 * Enable/disable an agent's saved report schedule without touching its other
 * settings. Used by the Run/Stop control so an agent only does scheduled work
 * while it is "running". No-ops gracefully if the agent has no saved schedule.
 */
export async function setReportScheduleEnabled(
  agent: ScheduleAgent,
  enabled: boolean,
): Promise<void> {
  const existing = await getReportScheduleFromServer(agent);
  if (!existing) return;
  if (existing.enabled === enabled) return;
  await saveReportScheduleToServer(agent, {
    time: existing.time,
    date: existing.date,
    frequency: existing.frequency,
    emails: existing.emails,
    config: existing.config,
    enabled,
  });
}
