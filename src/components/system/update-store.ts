"use client";

import type { SelectionItem } from "@/lib/report-selections";

// --------------------------------------------------------------------------
// Wire format (mirrors backend/Extract_selected_reports.py)
// --------------------------------------------------------------------------

export type UpdateEvent =
  | {
      type: "start";
      totalFiles: number;
      totalCompanies: number;
      sourceDir: string;
      testingDir: string;
      dryRun: boolean;
      option: string;
      model: string;
    }
  | { type: "copy-start"; total: number }
  | {
      type: "copy";
      index: number;
      total: number;
      company: string;
      fileName: string;
      status: "copied" | "skipped" | "missing" | "error";
      error?: string;
      destination?: string;
    }
  | {
      type: "company-start";
      index: number;
      total: number;
      company: string;
      companyKey: string;
      pdfFile: string;
    }
  | {
      type: "company-done";
      index: number;
      total: number;
      company: string;
      companyKey: string;
      status: string;
      error?: string | null;
    }
  | { type: "log"; level: string; message: string }
  | { type: "error"; message: string }
  | {
      type: "done";
      totalFiles: number;
      totalCompanies: number;
      ok: number;
      failed: number;
      testingDir: string;
    }
  | { type: "exit"; code: number };

// --------------------------------------------------------------------------
// Store shape
// --------------------------------------------------------------------------

export type UpdateSummary = {
  totalFiles: number;
  totalCompanies: number;
  ok: number;
  failed: number;
  testingDir: string;
};

export type UpdateStoreState = {
  updating: boolean;
  progress: number; // 0-100
  message: string;
  log: string[];
  error: string | null;
  lastCompletedAt: number | null;
  completedRunCount: number;
  totalFiles: number;
  totalCompanies: number;
  copiedCount: number;
  copyFailedCount: number;
  okCount: number;
  failedCount: number;
  currentCompany: string | null;
  currentCompanyIndex: number;
  summary: UpdateSummary | null;
};

const initialState: UpdateStoreState = {
  updating: false,
  progress: 0,
  message: "",
  log: [],
  error: null,
  lastCompletedAt: null,
  completedRunCount: 0,
  totalFiles: 0,
  totalCompanies: 0,
  copiedCount: 0,
  copyFailedCount: 0,
  okCount: 0,
  failedCount: 0,
  currentCompany: null,
  currentCompanyIndex: 0,
  summary: null,
};

type ExtractTick = {
  company: string;
  index: number;
  total: number;
  startedAt: number;
  baseProgress: number;
  targetProgress: number;
};

type Internal = {
  state: UpdateStoreState;
  listeners: Set<() => void>;
  abortCtrl: AbortController | null;
  bootstrapped: boolean;
  // Drives the slow-creep progress bar + rotating sub-step messages while a
  // single company is being extracted (the call to data_retrive.process_company
  // is opaque from the parent's POV — these animations fill that gap so the UI
  // never looks frozen).
  tick: ExtractTick | null;
  tickTimer: ReturnType<typeof setInterval> | null;
};

const g = globalThis as unknown as { __updateStore?: Internal };
if (!g.__updateStore) {
  g.__updateStore = {
    state: initialState,
    listeners: new Set(),
    abortCtrl: null,
    bootstrapped: false,
    tick: null,
    tickTimer: null,
  };
}
const store = g.__updateStore!;

// Rotating sub-step labels shown while a company is being extracted. They are
// purely cosmetic but mirror the actual pipeline (step1 → step2 → step3) so
// the user gets a feel for what's happening.
const EXTRACT_SUBSTEPS: readonly string[] = [
  "Analyzing PDF structure",
  "Detecting financial statement pages",
  "Rendering statement page images",
  "Preparing captures for OpenAI vision",
  "Sending pages to OpenAI",
  "Transcribing tables from images",
  "Parsing OpenAI response",
  "Saving extracted JSON",
];

// Seconds it takes for the creep to traverse ~95% of the remaining gap. A
// large value keeps the bar moving "slowly" so it never looks like the UI is
// hanging, even on long OpenAI round-trips.
const EXTRACT_CREEP_TAU_SEC = 45;
// How often to swap the visible sub-step text.
const EXTRACT_SUBSTEP_PERIOD_SEC = 4;
// How often to recompute the animated progress + message.
const EXTRACT_TICK_MS = 800;

function stopExtractAnimation() {
  if (store.tickTimer) {
    clearInterval(store.tickTimer);
    store.tickTimer = null;
  }
  store.tick = null;
}

function tickExtractAnimation() {
  const tick = store.tick;
  if (!tick) return;
  const elapsed = (Date.now() - tick.startedAt) / 1000;
  // Asymptotically approach (but never reach) the target progress so the bar
  // visibly moves without lying about completion.
  const gap = Math.max(0, tick.targetProgress - tick.baseProgress - 0.5);
  const eased = 1 - Math.exp(-elapsed / EXTRACT_CREEP_TAU_SEC);
  const animated = tick.baseProgress + gap * eased;
  const idx =
    Math.floor(elapsed / EXTRACT_SUBSTEP_PERIOD_SEC) % EXTRACT_SUBSTEPS.length;
  setState({
    progress: Math.max(
      store.state.progress,
      Math.min(99, Math.round(animated)),
    ),
    message: `Extracting ${tick.company} (${tick.index}/${tick.total}) — ${EXTRACT_SUBSTEPS[idx]}…`,
  });
}

function startExtractAnimation(
  company: string,
  index: number,
  total: number,
) {
  stopExtractAnimation();
  const base = store.state.progress;
  // Simulate what computeProgress() will return after this company finishes
  // successfully so the creep has a sensible upper bound.
  const finished: UpdateStoreState = {
    ...store.state,
    okCount: store.state.okCount + 1,
  };
  const target = computeProgress(finished);
  store.tick = {
    company,
    index,
    total,
    startedAt: Date.now(),
    baseProgress: base,
    targetProgress: target,
  };
  // Show the first sub-step immediately instead of waiting one full interval.
  tickExtractAnimation();
  store.tickTimer = setInterval(tickExtractAnimation, EXTRACT_TICK_MS);
}

function notify() {
  for (const l of store.listeners) {
    try {
      l();
    } catch {}
  }
}

function setState(partial: Partial<UpdateStoreState>) {
  store.state = { ...store.state, ...partial };
  notify();
}

function appendLog(line: string) {
  const next = [...store.state.log, line];
  if (next.length > 200) next.splice(0, next.length - 200);
  setState({ log: next });
}

// Copies are ~30% of the work, OpenAI extraction the remaining ~70%.
const COPY_WEIGHT = 0.3;
const EXTRACT_WEIGHT = 0.7;

function computeProgress(s: UpdateStoreState): number {
  const copyTotal = Math.max(1, s.totalFiles);
  const extractTotal = Math.max(1, s.totalCompanies);
  const copyDone = s.copiedCount + s.copyFailedCount;
  const extractDone = s.okCount + s.failedCount;
  const ratio =
    (s.totalFiles > 0 ? COPY_WEIGHT * (copyDone / copyTotal) : 0) +
    (s.totalCompanies > 0
      ? EXTRACT_WEIGHT * (extractDone / extractTotal)
      : 0);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

function handleEvent(ev: UpdateEvent) {
  switch (ev.type) {
    case "start":
      store.state = {
        ...initialState,
        updating: true,
        completedRunCount: store.state.completedRunCount,
        message:
          ev.totalFiles > 0
            ? `Starting extraction for ${ev.totalFiles} report${
                ev.totalFiles === 1 ? "" : "s"
              } across ${ev.totalCompanies} compan${
                ev.totalCompanies === 1 ? "y" : "ies"
              }...`
            : "Starting extraction...",
        totalFiles: ev.totalFiles,
        totalCompanies: ev.totalCompanies,
      };
      notify();
      appendLog(
        `Starting extraction (output: ${ev.testingDir}, model: ${ev.model}, dry-run: ${ev.dryRun}).`,
      );
      break;
    case "copy-start":
      setState({ message: "Copying selected reports..." });
      appendLog(
        `Copying ${ev.total} selected file${ev.total === 1 ? "" : "s"} into testing/...`,
      );
      break;
    case "copy": {
      let copied = store.state.copiedCount;
      let copyFailed = store.state.copyFailedCount;
      if (ev.status === "copied" || ev.status === "skipped") {
        copied += 1;
      } else {
        copyFailed += 1;
      }
      const tag = ev.status === "skipped" ? "= already" : ev.status;
      appendLog(
        `[${ev.index}/${ev.total}] ${tag} ${ev.company} / ${ev.fileName}${
          ev.error ? ` -- ${ev.error}` : ""
        }`,
      );
      const next: UpdateStoreState = {
        ...store.state,
        copiedCount: copied,
        copyFailedCount: copyFailed,
        message:
          ev.status === "error" || ev.status === "missing"
            ? `Copy failed: ${ev.company} / ${ev.fileName}`
            : `Copied ${ev.company} / ${ev.fileName}`,
      };
      next.progress = computeProgress(next);
      store.state = next;
      notify();
      break;
    }
    case "company-start":
      setState({
        currentCompany: ev.company,
        currentCompanyIndex: ev.index,
        message: `Extracting ${ev.company} (${ev.index}/${ev.total}) — ${EXTRACT_SUBSTEPS[0]}…`,
      });
      appendLog(
        `[company ${ev.index}/${ev.total}] ${ev.company} -- driver PDF: ${ev.pdfFile}`,
      );
      startExtractAnimation(ev.company, ev.index, ev.total);
      break;
    case "company-done": {
      stopExtractAnimation();
      let ok = store.state.okCount;
      let failed = store.state.failedCount;
      if (ev.status === "ok" || ev.status === "skipped_existing") {
        ok += 1;
      } else {
        failed += 1;
      }
      appendLog(
        `Finished ${ev.company}: ${ev.status}${
          ev.error ? ` -- ${ev.error}` : ""
        }`,
      );
      const next: UpdateStoreState = {
        ...store.state,
        okCount: ok,
        failedCount: failed,
        message: `Finished ${ev.company} (${ev.index}/${ev.total}).`,
      };
      next.progress = computeProgress(next);
      store.state = next;
      notify();
      break;
    }
    case "log":
      appendLog(ev.message);
      break;
    case "error":
      stopExtractAnimation();
      setState({ error: ev.message });
      appendLog(`Error: ${ev.message}`);
      break;
    case "done":
      stopExtractAnimation();
      setState({
        progress: 100,
        message: `Extraction complete. ${ev.ok} succeeded, ${ev.failed} failed.`,
        summary: {
          totalFiles: ev.totalFiles,
          totalCompanies: ev.totalCompanies,
          ok: ev.ok,
          failed: ev.failed,
          testingDir: ev.testingDir,
        },
      });
      appendLog(
        `Done. ${ev.ok}/${ev.totalCompanies} compan${
          ev.totalCompanies === 1 ? "y" : "ies"
        } extracted successfully (${ev.failed} failed).`,
      );
      break;
    case "exit":
      stopExtractAnimation();
      if (ev.code !== 0 && !store.state.error) {
        appendLog(`Script exited with code ${ev.code}.`);
      }
      setState({
        updating: false,
        currentCompany: null,
        completedRunCount: store.state.completedRunCount + 1,
        lastCompletedAt: Date.now(),
      });
      break;
  }
}

// --------------------------------------------------------------------------
// Network
// --------------------------------------------------------------------------

async function connect(method: "GET" | "POST", body?: Record<string, unknown>) {
  store.abortCtrl?.abort();
  const ctrl = new AbortController();
  store.abortCtrl = ctrl;

  try {
    const res = await fetch("/api/system/update", {
      method,
      headers:
        method === "POST"
          ? { "Content-Type": "application/json" }
          : undefined,
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });

    if (!res.ok || !res.body) {
      if (method === "POST") {
        let detail = `Request failed (${res.status})`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data && typeof data.error === "string") detail = data.error;
        } catch {}
        setState({
          updating: false,
          error: detail,
          message: detail,
        });
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
            handleEvent(JSON.parse(line) as UpdateEvent);
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
        handleEvent(JSON.parse(tail) as UpdateEvent);
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
    // If the stream closed while we still believed an update was running
    // (e.g. server restart), reset the updating flag.
    if (store.state.updating) {
      stopExtractAnimation();
      setState({
        updating: false,
        currentCompany: null,
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

// --------------------------------------------------------------------------
// Public API (consumed by components)
// --------------------------------------------------------------------------

export function subscribe(fn: () => void) {
  store.listeners.add(fn);
  bootstrap();
  return () => {
    store.listeners.delete(fn);
  };
}

export function getSnapshot(): UpdateStoreState {
  return store.state;
}

export function getServerSnapshot(): UpdateStoreState {
  return initialState;
}

export interface RunUpdateOptions {
  items: SelectionItem[];
  dryRun?: boolean;
  option?: "1" | "2";
  model?: string;
}

export async function runUpdate(opts: RunUpdateOptions) {
  if (store.state.updating) return;
  if (!opts.items || opts.items.length === 0) return;
  store.bootstrapped = true;
  await connect("POST", {
    items: opts.items,
    dryRun: opts.dryRun === true,
    option: opts.option,
    model: opts.model,
  });
}

export async function cancelUpdate() {
  try {
    await fetch("/api/system/update", {
      method: "DELETE",
      cache: "no-store",
    });
  } catch {
    // The active stream will be closed server-side; the client receives the
    // close + exit event through the open NDJSON connection.
  }
}

export function resetUpdate() {
  stopExtractAnimation();
  store.state = {
    ...initialState,
    completedRunCount: store.state.completedRunCount,
  };
  notify();
}
