"use client";

/**
 * Stores for Live Table Extraction download + extract jobs.
 *
 * Shared by the Development (Test Here) page and floating status so run
 * buttons stream real progress + logs and can be stopped.
 */

export type LiveReportSelection = {
  report_type: "Annual" | "Quarterly";
  year: number;
  quarter?: number;
};

export type LiveDemoItem = {
  company: string;
  report_type: string;
  file_name: string;
  rel_path: string;
  group: string;
};

type JobKind = "download" | "extract";

export type StageResult = {
  company: string;
  label: string;
  group: string;
  status: string;
  error: string | null;
  tables: number | null;
  cellsFilled: number | null;
  cellsMissing: number | null;
};

export type LiveJobState = {
  running: boolean;
  log: string[];
  error: string | null;
  summary: Record<string, unknown> | null;
  progress: { done: number; total: number } | null;
  stageLabel: string | null;
  results: StageResult[];
};

const initial: LiveJobState = {
  running: false,
  log: [],
  error: null,
  summary: null,
  progress: null,
  stageLabel: null,
  results: [],
};

type Internal = {
  download: LiveJobState;
  extract: LiveJobState;
  listeners: Set<() => void>;
  abort: { download: AbortController | null; extract: AbortController | null };
  snapshot: { download: LiveJobState; extract: LiveJobState };
};

const g = globalThis as unknown as { __liveExtractionStore?: Internal };
if (!g.__liveExtractionStore) {
  g.__liveExtractionStore = {
    download: { ...initial },
    extract: { ...initial },
    listeners: new Set(),
    abort: { download: null, extract: null },
    snapshot: { download: { ...initial }, extract: { ...initial } },
  };
}
const store = g.__liveExtractionStore!;

// Migrate a store instance that was created before `results` existed (the
// object survives HMR / hot reloads via globalThis), so reads never hit
// `undefined.length`.
for (const k of ["download", "extract"] as const) {
  if (!Array.isArray(store[k].results)) {
    store[k] = { ...initial, ...store[k], results: [] };
  } else {
    store[k].results = store[k].results.map((r) => ({
      cellsFilled: null,
      cellsMissing: null,
      ...r,
    }));
  }
}

function refreshSnapshot() {
  store.snapshot = { download: store.download, extract: store.extract };
}
refreshSnapshot();

function notify() {
  refreshSnapshot();
  for (const l of store.listeners) {
    try {
      l();
    } catch {}
  }
}

function setJob(kind: JobKind, partial: Partial<LiveJobState>) {
  store[kind] = { ...store[kind], ...partial };
  notify();
}

function appendLog(kind: JobKind, msg: string) {
  const stamp = new Date().toLocaleTimeString();
  const next = [`${stamp}  ${msg}`, ...store[kind].log];
  if (next.length > 400) next.splice(400);
  setJob(kind, { log: next });
}

function totalFromStart(evt: Record<string, unknown>): number {
  const n =
    Number(evt.totalSteps ?? 0) ||
    Number(evt.totalReports ?? 0) ||
    Number(evt.totalFiles ?? 0) ||
    0;
  return Number.isFinite(n) ? n : 0;
}

function bumpDone(kind: JobKind, evt: Record<string, unknown>) {
  const prev = store[kind].progress;
  if (!prev) return;
  const explicit = evt.done != null ? Number(evt.done) : null;
  const done =
    explicit != null && Number.isFinite(explicit)
      ? Math.min(prev.total, explicit)
      : Math.min(prev.total, prev.done + 1);
  setJob(kind, { progress: { ...prev, done } });
}

function handleEvent(kind: JobKind, evt: Record<string, unknown>) {
  const type = String(evt.type ?? "");
  switch (type) {
    case "start":
      setJob(kind, {
        running: true,
        error: null,
        summary: null,
        progress: { done: 0, total: totalFromStart(evt) },
        stageLabel: null,
        results: [],
      });
      appendLog(
        kind,
        `Started${evt.mode ? ` · ${evt.mode}` : ""} (${totalFromStart(evt)} step(s))`,
      );
      break;
    case "company-start":
      setJob(kind, { stageLabel: String(evt.company ?? "") });
      appendLog(kind, `Company: ${evt.company}`);
      break;
    case "company-done":
      appendLog(
        kind,
        `${evt.company}: ${evt.status}${evt.error ? ` — ${evt.error}` : ""}`,
      );
      break;
    case "file-done":
      bumpDone(kind, evt);
      appendLog(kind, `  ${evt.group ?? ""} → ${evt.outcome ?? evt.status}`);
      break;
    case "year-start":
      appendLog(kind, `Year ${evt.year}`);
      break;
    case "stage-start":
      setJob(kind, {
        stageLabel: String(evt.label ?? evt.group ?? evt.fileName ?? evt.stage ?? ""),
      });
      appendLog(kind, `  ${evt.label ?? evt.stage ?? ""}`);
      break;
    case "stage-done": {
      bumpDone(kind, evt);
      const ok = evt.ok !== false;
      const status = String(
        evt.status ?? (ok ? "ok" : "failed"),
      );
      const title = String(
        evt.label ??
          evt.group ??
          (evt.year != null
            ? `${evt.stage === "quarterly" ? "Quarterly" : "Annual"} report ${evt.year}${
                evt.quarter ? ` ${evt.quarter}` : ""
              }`
            : ""),
      );
      const result: StageResult = {
        company: String(evt.company ?? ""),
        label: title,
        group: String(evt.group ?? ""),
        status,
        error: evt.error != null ? String(evt.error) : null,
        tables: evt.tables != null ? Number(evt.tables) : null,
        cellsFilled:
          evt.cells_filled != null ? Number(evt.cells_filled) : null,
        cellsMissing:
          evt.cells_missing != null ? Number(evt.cells_missing) : null,
      };
      setJob(kind, { results: [...store[kind].results, result] });
      appendLog(
        kind,
        `  done: ${title || status}${
          result.cellsFilled != null
            ? ` — ${result.cellsFilled} extracted, ${result.cellsMissing ?? 0} missing`
            : evt.cells_filled != null
              ? ` (${evt.cells_filled} cells)`
              : ""
        }${evt.error ? ` — ${evt.error}` : ""}`,
      );
      break;
    }
    case "db-upload": {
      const tables = Number(evt.tables ?? 0) || 0;
      const list = store[kind].results;
      // Attach the table count to the most recent matching stage result.
      for (let i = list.length - 1; i >= 0; i--) {
        if (
          list[i].company === String(evt.company ?? "") &&
          list[i].tables == null
        ) {
          const next = [...list];
          next[i] = { ...next[i], tables };
          setJob(kind, { results: next });
          break;
        }
      }
      appendLog(
        kind,
        `  DB upload (${evt.reportType ?? ""} ${evt.year ?? ""}): ${evt.status ?? ""} — ${tables} table(s)`,
      );
      break;
    }
    case "log":
      appendLog(kind, String(evt.message ?? ""));
      break;
    case "error":
      setJob(kind, { error: String(evt.message ?? "Unknown error") });
      appendLog(kind, `ERROR: ${evt.message ?? ""}`);
      break;
    case "done": {
      const prev = store[kind].progress;
      setJob(kind, {
        summary: evt,
        running: false,
        stageLabel: null,
        progress: prev ? { ...prev, done: prev.total } : null,
      });
      appendLog(kind, `Done — ok:${evt.ok ?? 0} failed:${evt.failed ?? 0}`);
      break;
    }
    case "exit":
      setJob(kind, { running: false, stageLabel: null });
      if (Number(evt.code ?? 0) !== 0) {
        appendLog(kind, `Exit code ${evt.code}`);
      }
      break;
    default:
      break;
  }
}

async function connect(
  kind: JobKind,
  endpoint: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
) {
  store.abort[kind]?.abort();
  const ctrl = new AbortController();
  store.abort[kind] = ctrl;

  try {
    const res = await fetch(endpoint, {
      method,
      headers:
        method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok || !res.body) {
      if (method === "POST") {
        setJob(kind, { running: false, error: `Request failed (${res.status})` });
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
            handleEvent(kind, JSON.parse(line) as Record<string, unknown>);
          } catch {
            appendLog(kind, line);
          }
        }
        nl = buf.indexOf("\n");
      }
    }
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") return;
    setJob(kind, {
      running: false,
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    if (store.abort[kind] === ctrl) store.abort[kind] = null;
    if (store[kind].running) setJob(kind, { running: false, stageLabel: null });
  }
}

export function subscribe(fn: () => void) {
  store.listeners.add(fn);
  return () => store.listeners.delete(fn);
}

export function getSnapshot() {
  return store.snapshot;
}

export function getServerSnapshot() {
  return store.snapshot;
}

export async function runDownload(payload: Record<string, unknown>) {
  setJob("download", {
    running: true,
    log: [],
    error: null,
    summary: null,
    progress: null,
    stageLabel: null,
    results: [],
  });
  await connect("download", "/api/system/live-extraction/download", "POST", payload);
}

export async function runExtract(payload: Record<string, unknown>) {
  setJob("extract", {
    running: true,
    log: [],
    error: null,
    summary: null,
    progress: null,
    stageLabel: null,
    results: [],
  });
  await connect("extract", "/api/system/live-extraction/extract", "POST", payload);
}

export async function cancelDownload() {
  try {
    await fetch("/api/system/live-extraction/download", { method: "DELETE" });
  } catch {
    /* exit event arrives via the active stream */
  }
}

export async function cancelExtract() {
  try {
    await fetch("/api/system/live-extraction/extract", { method: "DELETE" });
  } catch {
    /* exit event arrives via the active stream */
  }
}

export function liveExtractProgressPct(state: LiveJobState): number {
  if (!state.progress || state.progress.total <= 0) {
    return state.running ? 0 : 0;
  }
  return Math.min(
    100,
    Math.round((state.progress.done / state.progress.total) * 100),
  );
}

/**
 * True when the bar should animate as a busy indicator instead of showing a
 * fixed width. A single-report run has total <= 1, so a determinate bar would
 * just sit at 0% for the whole (multi-minute) extraction — animate instead.
 */
export function liveExtractIndeterminate(state: LiveJobState): boolean {
  if (!state.running) return false;
  const p = state.progress;
  if (!p || p.total <= 1) return true;
  return p.done <= 0;
}
