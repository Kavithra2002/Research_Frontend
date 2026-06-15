"use client";

import * as React from "react";

/* ────────────────────────────────────────────────────────────────────────── *
 * Generated-report client API.
 *
 * Agent summary reports generated in the Configuration panel are persisted on
 * the server in a local "Gen_reports" folder (see /api/ai/reports). This module
 * is the browser-side client for that store.
 * ────────────────────────────────────────────────────────────────────────── */

export interface GeneratedReport {
  id: string;
  agent?: string;
  /** Short, human-friendly title derived from the report or its inputs. */
  title: string;
  /** Full Markdown content of the report. */
  content: string;
  /** Epoch milliseconds the report was generated. */
  createdAt: number;
  companies?: string[];
  metrics?: string[];
}

export const AGENT_REPORTS_UPDATED_EVENT = "ambeon:agent-reports-updated";

function notifyUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AGENT_REPORTS_UPDATED_EVENT));
  }
}

/** Newest report first. */
export async function listAgentReports(
  agent: string,
): Promise<GeneratedReport[]> {
  const res = await fetch(`/api/ai/reports?agent=${encodeURIComponent(agent)}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { reports?: GeneratedReport[] };
  return Array.isArray(json.reports) ? json.reports : [];
}

export async function getAgentReport(
  id: string,
): Promise<GeneratedReport | null> {
  const res = await fetch(`/api/ai/reports/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { report?: GeneratedReport };
  return json.report ?? null;
}

/** Save a freshly generated report; returns the stored record. */
export async function saveAgentReport(
  agent: string,
  input: {
    content: string;
    title?: string;
    companies?: string[];
    metrics?: string[];
  },
): Promise<GeneratedReport | null> {
  const res = await fetch(`/api/ai/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent, ...input }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { report?: GeneratedReport };
  notifyUpdated();
  return json.report ?? null;
}

export async function deleteAgentReport(id: string): Promise<boolean> {
  const res = await fetch(`/api/ai/reports/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { removed?: boolean };
  notifyUpdated();
  return Boolean(json.removed);
}

/** Reactive list of an agent's generated reports (refetches on updates). */
export function useAgentReports(agent: string): {
  reports: GeneratedReport[];
  loading: boolean;
  refresh: () => void;
} {
  const [reports, setReports] = React.useState<GeneratedReport[]>([]);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(() => {
    let cancelled = false;
    setLoading(true);
    void listAgentReports(agent)
      .then((list) => {
        if (!cancelled) setReports(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agent]);

  React.useEffect(() => {
    const cleanup = refresh();
    const onUpdate = () => refresh();
    window.addEventListener(AGENT_REPORTS_UPDATED_EVENT, onUpdate);
    return () => {
      cleanup?.();
      window.removeEventListener(AGENT_REPORTS_UPDATED_EVENT, onUpdate);
    };
  }, [refresh]);

  return { reports, loading, refresh };
}
