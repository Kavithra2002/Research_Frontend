"use client";

/**
 * Global store for the Development page demo report extraction pipeline.
 *
 * The Python job is started via /api/demo/run and keeps running on the server
 * even when the user navigates away from /test-here. A floating status widget
 * (demo-run-floating-status.tsx) mirrors components/system/scan-store.ts.
 */

export type DemoRunItem = {
  company: string;
  report_type: "Annual" | "Quarterly";
  file_name: string;
  rel_path: string;
  group: string;
};

export type DbUpload = {
  company: string;
  reportType: string;
  group: string;
  year: string;
  status: string;
  tables: number;
  error?: string | null;
};

export type DemoRunSummary = {
  ok: number;
  failed: number;
  uploaded: boolean;
};

export type DemoRunStoreState = {
  running: boolean;
  progress: { done: number; total: number } | null;
  activeStage: boolean;
  currentCompany: string | null;
  stageLabel: string | null;
  log: string[];
  uploads: DbUpload[];
  summary: DemoRunSummary | null;
  error: string | null;
  completedRunCount: number;
};

const initialState: DemoRunStoreState = {
  running: false,
  progress: null,
  activeStage: false,
  currentCompany: null,
  stageLabel: null,
  log: [],
  uploads: [],
  summary: null,
  error: null,
  completedRunCount: 0,
};

type Internal = {
  state: DemoRunStoreState;
  listeners: Set<() => void>;
  abortCtrl: AbortController | null;
  bootstrapped: boolean;
};

const g = globalThis as unknown as { __demoRunStore?: Internal };
if (!g.__demoRunStore) {
  g.__demoRunStore = {
    state: initialState,
    listeners: new Set(),
    abortCtrl: null,
    bootstrapped: false,
  };
}
const store = g.__demoRunStore!;

function notify() {
  for (const l of store.listeners) {
    try {
      l();
    } catch {}
  }
}

function setState(partial: Partial<DemoRunStoreState>) {
  store.state = { ...store.state, ...partial };
  notify();
}

function appendLog(msg: string) {
  const stamp = new Date().toLocaleTimeString();
  const next = [`${stamp}  ${msg}`, ...store.state.log];
  if (next.length > 500) next.splice(500);
  setState({ log: next });
}

function handleEvent(evt: Record<string, unknown>) {
  const type = String(evt.type ?? "");
  switch (type) {
    case "start":
      setState({
        running: true,
        progress: { done: 0, total: Number(evt.totalFiles ?? 0) },
        activeStage: false,
        currentCompany: null,
        stageLabel: null,
        summary: null,
        error: null,
      });
      appendLog(`Starting: ${evt.totalFiles} report(s)`);
      break;
    case "company-start":
      setState({ currentCompany: String(evt.company ?? "") });
      appendLog(
        `Extracting ${evt.company} (A:${evt.annualCount} Q:${evt.quarterlyCount})...`,
      );
      break;
    case "stage-start":
      setState({
        activeStage: true,
        stageLabel: String(evt.group || evt.fileName || ""),
      });
      appendLog(`  ${evt.kind} · ${evt.group || evt.fileName}: extracting...`);
      break;
    case "stage-done": {
      const prev = store.state.progress;
      setState({
        activeStage: false,
        stageLabel: null,
        progress: prev
          ? { ...prev, done: Math.min(prev.total, prev.done + 1) }
          : null,
      });
      appendLog(`  ${evt.kind} · ${evt.group || ""} extraction: ${evt.status}`);
      break;
    }
    case "db-upload": {
      const yq = [evt.year, evt.quarter].filter(Boolean).join(" ");
      setState({
        uploads: [
          {
            company: String(evt.company ?? ""),
            reportType: String(evt.reportType ?? ""),
            group: String(evt.group ?? ""),
            year: yq,
            status: String(evt.status ?? ""),
            tables: Number(evt.tables ?? 0),
            error: (evt.error as string) ?? null,
          },
          ...store.state.uploads,
        ],
      });
      appendLog(
        `  DB upload (${evt.reportType} ${yq}): ${evt.status} — ${evt.tables ?? 0} table(s)`,
      );
      break;
    }
    case "log":
      appendLog(String(evt.message ?? ""));
      break;
    case "error":
      setState({ error: String(evt.message ?? "Unknown error") });
      appendLog(`ERROR: ${evt.message ?? ""}`);
      break;
    case "done":
      setState({
        summary: {
          ok: Number(evt.ok ?? 0),
          failed: Number(evt.failed ?? 0),
          uploaded: Boolean(evt.uploaded),
        },
        activeStage: false,
        progress: store.state.progress
          ? { ...store.state.progress, done: store.state.progress.total }
          : null,
      });
      appendLog(`Done — ${evt.ok} ok, ${evt.failed} failed.`);
      break;
    case "exit":
      setState({
        running: false,
        activeStage: false,
        completedRunCount: store.state.completedRunCount + 1,
      });
      if (Number(evt.code ?? 0) !== 0) {
        appendLog(`Script exited with code ${evt.code}.`);
      }
      break;
    default:
      break;
  }
}

async function connect(method: "GET" | "POST", body?: Record<string, unknown>) {
  store.abortCtrl?.abort();
  const ctrl = new AbortController();
  store.abortCtrl = ctrl;

  try {
    const res = await fetch("/api/demo/run", {
      method,
      headers:
        method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });

    if (!res.ok || !res.body) {
      if (method === "POST") {
        const msg = `Request failed (${res.status})`;
        setState({ error: msg, running: false });
        appendLog(`ERROR: ${msg}`);
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
            handleEvent(JSON.parse(line) as Record<string, unknown>);
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
        handleEvent(JSON.parse(tail) as Record<string, unknown>);
      } catch {
        appendLog(tail);
      }
    }
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") return;
    const msg = e instanceof Error ? e.message : String(e);
    setState({ error: msg, running: false });
    appendLog(`ERROR: ${msg}`);
  } finally {
    if (store.abortCtrl === ctrl) {
      store.abortCtrl = null;
    }
    if (store.state.running) {
      setState({
        running: false,
        activeStage: false,
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

export function getSnapshot(): DemoRunStoreState {
  return store.state;
}

export function getServerSnapshot(): DemoRunStoreState {
  return initialState;
}

export async function runDemo(items: DemoRunItem[]) {
  if (store.state.running) return;
  store.bootstrapped = true;
  setState({
    running: true,
    error: null,
    progress: null,
    activeStage: false,
    currentCompany: null,
    stageLabel: null,
    log: [],
    uploads: [],
    summary: null,
  });
  await connect("POST", { items });
}

export async function cancelDemoRun() {
  try {
    await fetch("/api/demo/run", { method: "DELETE", cache: "no-store" });
  } catch {
    // ignore — exit event arrives via the active stream
  }
}

export function getDemoRunProgressPct(
  progress: DemoRunStoreState["progress"],
  activeStage: boolean,
): number {
  if (!progress || progress.total <= 0) return 0;
  const displayDone = Math.min(
    progress.total,
    progress.done + (activeStage ? 0.6 : 0),
  );
  return Math.min(100, Math.round((displayDone / progress.total) * 100));
}

export function getTotalUploadedTables(uploads: DbUpload[]): number {
  return uploads.reduce((n, u) => n + u.tables, 0);
}
