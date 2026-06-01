"use client";

import { getPythonJobUrl } from "@/lib/python-jobs";

export type ProgressEvent =
  | { type: "start"; targetDate: string; outDir: string }
  | { type: "scan-start"; total: number }
  | {
      type: "progress";
      index: number;
      total: number;
      company: string;
      symbol: string;
    }
  | {
      type: "found";
      company: string;
      reportType: string;
      title: string;
      fileName: string;
    }
  | { type: "company-error"; company: string; symbol: string; error: string }
  | {
      type: "download-error";
      company: string;
      reportType: string;
      title: string;
      error: string;
    }
  | { type: "log"; level: string; message: string }
  | { type: "error"; message: string }
  | {
      type: "done";
      targetDate: string;
      totalCompanies: number;
      foundCount: number;
      failedCount: number;
    }
  | { type: "exit"; code: number };

export type ScanSummary = {
  foundCount: number;
  failedCount: number;
  totalCompanies: number;
  targetDate: string;
};

export type ScanStoreState = {
  scanning: boolean;
  progress: { index: number; total: number; company: string } | null;
  log: string[];
  foundDuringScan: number;
  summary: ScanSummary | null;
  error: string | null;
  // Bumps every time a scan finishes (success or failure), so subscribers
  // can react (e.g. refresh report list).
  completedRunCount: number;
};

const initialState: ScanStoreState = {
  scanning: false,
  progress: null,
  log: [],
  foundDuringScan: 0,
  summary: null,
  error: null,
  completedRunCount: 0,
};

type Internal = {
  state: ScanStoreState;
  listeners: Set<() => void>;
  abortCtrl: AbortController | null;
  bootstrapped: boolean;
};

const g = globalThis as unknown as { __scanStore?: Internal };
if (!g.__scanStore) {
  g.__scanStore = {
    state: initialState,
    listeners: new Set(),
    abortCtrl: null,
    bootstrapped: false,
  };
}
const store = g.__scanStore!;

function notify() {
  for (const l of store.listeners) {
    try {
      l();
    } catch {}
  }
}

function setState(partial: Partial<ScanStoreState>) {
  store.state = { ...store.state, ...partial };
  notify();
}

function appendLog(line: string) {
  const next = [...store.state.log, line];
  if (next.length > 200) next.splice(0, next.length - 200);
  setState({ log: next });
}

function handleEvent(ev: ProgressEvent) {
  switch (ev.type) {
    case "start":
      setState({
        scanning: true,
        progress: null,
        log: [],
        foundDuringScan: 0,
        summary: null,
        error: null,
      });
      appendLog(`Scanning for reports uploaded on ${ev.targetDate}...`);
      break;
    case "scan-start":
      appendLog(`Resolved ${ev.total} listed companies.`);
      break;
    case "progress":
      setState({
        progress: {
          index: ev.index,
          total: ev.total,
          company: ev.company,
        },
      });
      break;
    case "found":
      setState({ foundDuringScan: store.state.foundDuringScan + 1 });
      appendLog(
        `Found ${ev.reportType} report for ${ev.company}: ${ev.title}`,
      );
      break;
    case "company-error":
      appendLog(`Could not fetch ${ev.company}: ${ev.error}`);
      break;
    case "download-error":
      appendLog(
        `Download failed for ${ev.company} (${ev.reportType}): ${ev.error}`,
      );
      break;
    case "log":
      appendLog(ev.message);
      break;
    case "error":
      setState({ error: ev.message });
      appendLog(`Error: ${ev.message}`);
      break;
    case "done":
      setState({
        summary: {
          foundCount: ev.foundCount,
          failedCount: ev.failedCount,
          totalCompanies: ev.totalCompanies,
          targetDate: ev.targetDate,
        },
      });
      appendLog(
        `Done. ${ev.foundCount} new report${
          ev.foundCount === 1 ? "" : "s"
        } downloaded across ${ev.totalCompanies} compan${
          ev.totalCompanies === 1 ? "y" : "ies"
        }.`,
      );
      break;
    case "exit":
      if (ev.code !== 0) {
        appendLog(`Script exited with code ${ev.code}.`);
      }
      setState({
        scanning: false,
        progress: null,
        completedRunCount: store.state.completedRunCount + 1,
      });
      break;
  }
}

async function connect(method: "GET" | "POST", body?: Record<string, unknown>) {
  store.abortCtrl?.abort();
  const ctrl = new AbortController();
  store.abortCtrl = ctrl;

  try {
    const res = await fetch(getPythonJobUrl("/api/system/extract"), {
      method,
      headers:
        method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
      credentials: "include",
    });

    if (!res.ok || !res.body) {
      if (method === "POST") {
        setState({ error: `Request failed (${res.status})` });
      }
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl = buf.indexOf("\n");
      while (nl !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line.length > 0) {
          try {
            handleEvent(JSON.parse(line) as ProgressEvent);
          } catch {
            appendLog(line);
          }
        }
        nl = buf.indexOf("\n");
      }
    }
    const tail = buf.trim();
    if (tail.length > 0) {
      try {
        handleEvent(JSON.parse(tail) as ProgressEvent);
      } catch {
        appendLog(tail);
      }
    }
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") return;
    const msg = e instanceof Error ? e.message : String(e);
    setState({ error: msg });
    appendLog(`Error: ${msg}`);
  } finally {
    if (store.abortCtrl === ctrl) {
      store.abortCtrl = null;
    }
    // If the stream closed while we still believed a scan was running
    // (e.g. server restart), reset the scanning flag.
    if (store.state.scanning) {
      setState({
        scanning: false,
        progress: null,
        completedRunCount: store.state.completedRunCount + 1,
      });
    }
  }
}

function bootstrap() {
  if (store.bootstrapped) return;
  store.bootstrapped = true;
  void connect("GET");
}

export function subscribe(fn: () => void) {
  store.listeners.add(fn);
  bootstrap();
  return () => {
    store.listeners.delete(fn);
  };
}

export function getSnapshot(): ScanStoreState {
  return store.state;
}

export function getServerSnapshot(): ScanStoreState {
  return initialState;
}

export async function runScan(opts?: {
  date?: string;
  limit?: number;
  symbols?: string[];
  companies?: string[];
  groupId?: string;
  groupName?: string;
}) {
  if (store.state.scanning) return;
  store.bootstrapped = true;
  await connect("POST", opts ?? {});
}

export async function cancelScan() {
  try {
    await fetch(getPythonJobUrl("/api/system/extract"), {
      method: "DELETE",
      cache: "no-store",
      credentials: "include",
    });
  } catch {
    // Ignore - the server-side close will propagate via the active stream.
  }
}
