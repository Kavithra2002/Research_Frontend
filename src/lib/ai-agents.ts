"use client";

import * as React from "react";

export type AgentStatus = "Online" | "Working" | "Idle" | "Offline";

export type AiAgent = {
  id: string;
  name: string;
  role: string;
  task: string;
  avatarSrc: string;
  fallback: string;
  status: AgentStatus;
  /** Gradient used for hover/active background washes. */
  accent: string;
};

export const statusStyle: Record<
  AgentStatus,
  {
    dot: string;
    ring: string;
    text: string;
    chipBg: string;
    pulseVar: string;
  }
> = {
  Online: {
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/60",
    text: "text-emerald-600 dark:text-emerald-400",
    chipBg: "bg-emerald-500/10 border-emerald-500/30",
    pulseVar: "rgba(16, 185, 129, 0.55)",
  },
  Working: {
    dot: "bg-sky-500",
    ring: "ring-sky-500/60",
    text: "text-sky-600 dark:text-sky-400",
    chipBg: "bg-sky-500/10 border-sky-500/30",
    pulseVar: "rgba(14, 165, 233, 0.55)",
  },
  Idle: {
    dot: "bg-amber-500",
    ring: "ring-amber-500/50",
    text: "text-amber-600 dark:text-amber-400",
    chipBg: "bg-amber-500/10 border-amber-500/30",
    pulseVar: "rgba(245, 158, 11, 0.45)",
  },
  Offline: {
    dot: "bg-zinc-400",
    ring: "ring-zinc-400/40",
    text: "text-zinc-500 dark:text-zinc-400",
    chipBg: "bg-zinc-500/10 border-zinc-500/30",
    pulseVar: "rgba(0, 0, 0, 0)",
  },
};

export const statusOrder: AgentStatus[] = [
  "Online",
  "Working",
  "Idle",
  "Offline",
];

/** Full catalog of agents a user can add to their workspace. */
export const AGENT_CATALOG: AiAgent[] = [
  {
    id: "robin",
    name: "Robin",
    role: "Company Intelligence Agent",
    task: "Answers financial and non-financial company questions from the database, with web search for external impact analysis.",
    avatarSrc: "/img/robin-avatar.png",
    fallback: "RB",
    status: "Online",
    accent: "from-emerald-500/30 via-emerald-500/10 to-transparent",
  },
  {
    id: "marian",
    name: "Marian",
    role: "Daily Market Wrap Agent",
    task: "Builds the daily CSE market wrap as tables and charts you pick, and answers financial and non-financial company questions like Robin and Tuck.",
    avatarSrc: "/img/marian-avatar.png",
    fallback: "MR",
    status: "Online",
    accent: "from-sky-500/30 via-sky-500/10 to-transparent",
  },
  {
    id: "jone",
    name: "John",
    role: "Analytics Agent",
    task: "Live CSE market summary for your Analytics My List watchlist — focused on the market summary columns you configure.",
    avatarSrc: "/img/john-avatar.png",
    fallback: "JN",
    status: "Online",
    accent: "from-violet-500/30 via-violet-500/10 to-transparent",
  },
  {
    id: "scarlet",
    name: "Scarlet",
    role: "Configuration Agent",
    task: "Tunes the extraction model, prompts and runtime options for each run.",
    avatarSrc: "/img/scarlet-avatar.png",
    fallback: "SC",
    status: "Idle",
    accent: "from-amber-500/30 via-amber-500/10 to-transparent",
  },
  {
    id: "tuck",
    name: "Tuck",
    role: "Market Agent",
    task: "Live CSE market data plus financial and non-financial company Q&A from the database, with web search for external events.",
    avatarSrc: "/img/tuck-avatar.png",
    fallback: "TC",
    status: "Online",
    accent: "from-sky-500/30 via-sky-500/10 to-transparent",
  },
];

export function getAgentById(id: string): AiAgent | undefined {
  return AGENT_CATALOG.find((a) => a.id === id);
}

/**
 * Agents with a real configuration panel and workspace wiring. Anything not in
 * this set (e.g. Scarlet) cannot be added to the AI page yet.
 */
export const IMPLEMENTED_AGENT_IDS: ReadonlySet<string> = new Set([
  "robin",
  "marian",
  "tuck",
  "jone",
]);

export function isAgentImplemented(id: string): boolean {
  return IMPLEMENTED_AGENT_IDS.has(id);
}

/**
 * Single source of truth for an agent's live status, shared by the AI page and
 * the Configuration page so they never disagree. Implemented agents are Online
 * while their Run toggle is on and Idle otherwise; unimplemented agents stay
 * Idle regardless of running state.
 */
export function getAgentStatus(id: string, running: boolean): AgentStatus {
  if (!IMPLEMENTED_AGENT_IDS.has(id)) return "Idle";
  return running ? "Online" : "Idle";
}

const STORAGE_KEY = "ambeon.ai.agents.added";
export const AGENTS_UPDATED_EVENT = "ambeon:ai-agents-updated";

/** Legacy catalog id → current id. */
function normalizeStoredAgentId(id: string): string {
  if (id === "john") return "jone";
  return id;
}

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const rawId of parsed) {
      if (typeof rawId !== "string") continue;
      const id = normalizeStoredAgentId(rawId);
      if (
        !AGENT_CATALOG.some((a) => a.id === id) ||
        !IMPLEMENTED_AGENT_IDS.has(id) ||
        seen.has(id)
      ) {
        continue;
      }
      seen.add(id);
      out.push(id);
    }
    const cleaned = JSON.stringify(out);
    if (raw !== cleaned) {
      localStorage.setItem(STORAGE_KEY, cleaned);
    }
    return out;
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent(AGENTS_UPDATED_EVENT));
}

export function getAddedAgentIds(): string[] {
  return readIds();
}

export function addAgent(id: string) {
  if (!IMPLEMENTED_AGENT_IDS.has(id)) return;
  const ids = readIds();
  if (ids.includes(id)) return;
  writeIds([...ids, id]);
}

export function removeAgent(id: string) {
  const ids = readIds();
  writeIds(ids.filter((x) => x !== id));
}

/**
 * Reactive list of agent ids the user has added to their account. Stays in
 * sync across components (and browser tabs) via a custom event + storage event.
 */
export function useAddedAgentIds(): string[] {
  const [ids, setIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    const sync = () => setIds(readIds());
    sync();
    window.addEventListener(AGENTS_UPDATED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AGENTS_UPDATED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return ids;
}

/* ────────────────────────────────────────────────────────────────────────── *
 * Running state — agents do no scheduled work until the user presses "Run".
 * Persisted locally so a started agent stays running across reloads/tabs.
 * ────────────────────────────────────────────────────────────────────────── */

const RUNNING_KEY = "ambeon.ai.agents.running";
export const AGENTS_RUNNING_EVENT = "ambeon:ai-agents-running";

function readRunningIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RUNNING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const rawId of parsed) {
      if (typeof rawId !== "string") continue;
      const id = normalizeStoredAgentId(rawId);
      if (
        !AGENT_CATALOG.some((a) => a.id === id) ||
        !IMPLEMENTED_AGENT_IDS.has(id) ||
        seen.has(id)
      ) {
        continue;
      }
      seen.add(id);
      out.push(id);
    }
    const cleaned = JSON.stringify(out);
    if (raw !== cleaned) {
      localStorage.setItem(RUNNING_KEY, cleaned);
    }
    return out;
  } catch {
    return [];
  }
}

function writeRunningIds(ids: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(RUNNING_KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent(AGENTS_RUNNING_EVENT));
}

export function getRunningAgentIds(): string[] {
  return readRunningIds();
}

export function isAgentRunning(id: string): boolean {
  return readRunningIds().includes(id);
}

export function startAgent(id: string) {
  const ids = readRunningIds();
  if (ids.includes(id)) return;
  writeRunningIds([...ids, id]);
}

export function stopAgent(id: string) {
  const ids = readRunningIds();
  if (!ids.includes(id)) return;
  writeRunningIds(ids.filter((x) => x !== id));
}

/** Reactive set of agent ids that are currently running (work schedule active). */
export function useRunningAgentIds(): string[] {
  const [ids, setIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    const sync = () => setIds(readRunningIds());
    sync();
    window.addEventListener(AGENTS_RUNNING_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AGENTS_RUNNING_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return ids;
}
