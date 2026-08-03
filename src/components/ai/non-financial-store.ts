"use client";

/**
 * Global store for the Non-Financial AI analysis.
 *
 * Why this exists:
 *   - The Python analysis is kicked off via /api/ai/non-financial and the
 *     server-side child process stays alive across requests / page navigations.
 *   - We want the UI to keep tracking that process even after the user leaves
 *     /ai/non-financial, so the floating notification (see
 *     non-financial-floating-status.tsx) can show progress and offer a cancel
 *     (with confirmation) from any page.
 *
 * Design mirrors components/system/scan-store.ts.
 */

export type SectionFound = {
  key: string;
  title: string;
  pages: number[];
  charCount?: number;
};

export type ProgressInfo = {
  stage: string;
  message: string;
  current?: number;
  total?: number;
};

export type RealWorldPoint = {
  title: string;
  explanation: string;
  impact?: "positive" | "negative" | "mixed" | "neutral";
};

export type SectionSummary = {
  key: string;
  title: string;
  summary?: string;
  highlights?: string[];
};

export type NonFinancialResult = {
  company: string;
  pdf?: string;
  generated_at?: string;
  model?: string;
  sections_found?: SectionFound[];
  company_overview?: string;
  section_summaries?: SectionSummary[];
  real_world_analysis?: {
    summary?: string;
    points?: RealWorldPoint[];
  };
  overall_conclusion?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

export type LogEntry = {
  id: number;
  level: "info" | "warning" | "error" | "stderr" | "section";
  message: string;
};

export type NonFinancialStoreState = {
  running: boolean;
  company: string | null;
  progress: ProgressInfo | null;
  sectionsFound: SectionFound[];
  logs: LogEntry[];
  result: NonFinancialResult | null;
  error: string | null;
  completedRunCount: number;
};

const initialState: NonFinancialStoreState = {
  running: false,
  company: null,
  progress: null,
  sectionsFound: [],
  logs: [],
  result: null,
  error: null,
  completedRunCount: 0,
};

type Internal = {
  state: NonFinancialStoreState;
  listeners: Set<() => void>;
  abortCtrl: AbortController | null;
  bootstrapped: boolean;
  logCounter: number;
};

const g = globalThis as unknown as { __nonFinancialStore?: Internal };
if (!g.__nonFinancialStore) {
  g.__nonFinancialStore = {
    state: initialState,
    listeners: new Set(),
    abortCtrl: null,
    bootstrapped: false,
    logCounter: 0,
  };
}
const store = g.__nonFinancialStore!;

function notify() {
  for (const l of store.listeners) {
    try {
      l();
    } catch {}
  }
}

function setState(partial: Partial<NonFinancialStoreState>) {
  store.state = { ...store.state, ...partial };
  notify();
}

function appendLog(level: LogEntry["level"], message: string) {
  store.logCounter += 1;
  const entry: LogEntry = { id: store.logCounter, level, message };
  const next = [...store.state.logs, entry];
  if (next.length > 500) next.splice(0, next.length - 500);
  setState({ logs: next });
}

/**
 * Convert raw backend log lines into friendly user-facing status messages.
 * Returns `null` to suppress the line entirely (e.g. file paths, redundant
 * internal artefacts). Anything that exposes a filesystem path is dropped.
 */
function friendlyStatusMessage(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  if (/[A-Za-z]:[\\/]/.test(trimmed)) return null;
  if (/\/(?:reports|newly_uploaded_report|Extracted_json)\b/i.test(trimmed))
    return null;
  if (/^PDF\s*:/i.test(trimmed)) return null;
  if (/^Using\s+PDF\s*:/i.test(trimmed)) return null;
  if (/^Saved\b.*->/i.test(trimmed)) return null;
  if (/^Saved\b.*→/.test(trimmed)) return null;

  if (/^Started\s+non-financial\s+analysis\s+for/i.test(trimmed)) {
    return "Starting report analysis…";
  }
  if (/^Read\s+\d+\s+pages\s+from\s+the\s+PDF/i.test(trimmed)) {
    const m = trimmed.match(/Read\s+(\d+)/i);
    return m
      ? `Retrieved report content (${m[1]} pages).`
      : "Retrieved report content.";
  }
  if (/^Detected\s+\d+\s+company-specific\s+section/i.test(trimmed)) {
    const m = trimmed.match(/^Detected\s+(\d+)/i);
    return m
      ? `Identified ${m[1]} business sections for analysis.`
      : "Identified business sections for analysis.";
  }
  if (/^Found\s+".+"\s+on\s+pages?/i.test(trimmed)) {
    return null;
  }
  if (/^OpenAI\s+response\s+received/i.test(trimmed)) {
    return "AI briefing received.";
  }
  if (/^Received\s+final\s+AI\s+response/i.test(trimmed)) {
    return "Finalising results…";
  }
  if (/^Script\s+finished\s+successfully/i.test(trimmed)) {
    return "Analysis complete.";
  }
  if (/^Script\s+exited\s+with\s+code/i.test(trimmed)) {
    return "Analysis ended unexpectedly.";
  }
  if (/^Could\s+not\s+save/i.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function friendlyProgressMessage(stage: string, message: string): string {
  const s = stage.toLowerCase();
  if (s === "extract_text" || /extracted\s+text\s+from\s+page/i.test(message)) {
    return "Retrieving data from the report…";
  }
  if (s === "openai_call" || /^Sending\s+\d+\s+section/i.test(message)) {
    return "Generating AI briefing…";
  }
  return message;
}

function handleEvent(evt: Record<string, unknown>) {
  const type = typeof evt.type === "string" ? evt.type : "";
  switch (type) {
    case "start": {
      appendLog("info", "Starting report analysis…");
      const company =
        typeof evt.company === "string" ? evt.company.trim() : "";
      setState({
        running: true,
        error: null,
        progress: null,
        sectionsFound: [],
        result: null,
        company: company || store.state.company,
      });
      break;
    }
    case "log": {
      const level =
        typeof evt.level === "string" &&
        ["info", "warning", "error", "stderr"].includes(evt.level)
          ? (evt.level as LogEntry["level"])
          : "info";
      const rawMessage =
        typeof evt.message === "string" ? evt.message : JSON.stringify(evt);
      const friendly = friendlyStatusMessage(rawMessage);
      if (friendly !== null) {
        appendLog(level, friendly);
      }
      break;
    }
    case "progress": {
      const stage = typeof evt.stage === "string" ? evt.stage : "running";
      const rawMessage =
        typeof evt.message === "string" ? evt.message : stage;
      const message = friendlyProgressMessage(stage, rawMessage);
      const current = typeof evt.current === "number" ? evt.current : undefined;
      const total = typeof evt.total === "number" ? evt.total : undefined;
      setState({ progress: { stage, message, current, total } });
      break;
    }
    case "section_found": {
      const key = typeof evt.key === "string" ? evt.key : "section";
      const title =
        typeof evt.title === "string" ? evt.title : "Untitled section";
      const pages = Array.isArray(evt.pages)
        ? evt.pages.filter((p): p is number => typeof p === "number")
        : [];
      const charCount =
        typeof evt.char_count === "number" ? evt.char_count : undefined;
      setState({
        sectionsFound: [
          ...store.state.sectionsFound,
          { key, title, pages, charCount },
        ],
      });
      break;
    }
    case "warning": {
      const rawMessage =
        typeof evt.message === "string" ? evt.message : "(warning)";
      const friendly = friendlyStatusMessage(rawMessage);
      if (friendly !== null) {
        appendLog("warning", friendly);
      }
      break;
    }
    case "error": {
      const message =
        typeof evt.message === "string" ? evt.message : "(error)";
      appendLog("error", message);
      setState({ error: message });
      break;
    }
    case "result": {
      const data = evt.data as NonFinancialResult | undefined;
      if (data) {
        appendLog("info", "Finalising results…");
        setState({ result: data });
      }
      break;
    }
    case "exit":
    case "done": {
      const code = typeof evt.code === "number" ? evt.code : 0;
      if (code === 0) {
        appendLog("info", "Analysis complete.");
      } else {
        appendLog("error", "Analysis ended unexpectedly.");
        setState({ error: store.state.error ?? `Exit code ${code}` });
      }
      setState({
        running: false,
        progress: null,
        completedRunCount: store.state.completedRunCount + 1,
      });
      break;
    }
    default:
      break;
  }
}

async function connect(method: "GET" | "POST", body?: Record<string, unknown>) {
  store.abortCtrl?.abort();
  const ctrl = new AbortController();
  store.abortCtrl = ctrl;

  try {
    const res = await fetch("/api/ai/non-financial", {
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
        appendLog("error", msg);
      }
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
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
            // ignore malformed JSON line
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
        // ignore
      }
    }
  } catch (e) {
    if ((e as { name?: string }).name === "AbortError") return;
    const msg = e instanceof Error ? e.message : String(e);
    setState({ error: msg, running: false });
    appendLog("error", msg);
  } finally {
    if (store.abortCtrl === ctrl) {
      store.abortCtrl = null;
    }
    if (store.state.running) {
      // Stream closed while we still believed a run was active (e.g. server
      // restart). Reset the running flag so the UI doesn't get stuck.
      setState({
        running: false,
        progress: null,
        completedRunCount: store.state.completedRunCount + 1,
      });
    }
  }
}

function bootstrap() {
  if (store.bootstrapped) return;
  store.bootstrapped = true;
  // Attach to any in-flight analysis. The server replays its full event
  // history and keeps streaming until the run finishes.
  void connect("GET");
}

export function subscribe(fn: () => void) {
  store.listeners.add(fn);
  bootstrap();
  return () => {
    store.listeners.delete(fn);
  };
}

export function getSnapshot(): NonFinancialStoreState {
  return store.state;
}

export function getServerSnapshot(): NonFinancialStoreState {
  return initialState;
}

export async function runAnalysis(opts: {
  company: string;
  pdf?: string;
  demoRelPath?: string;
  model?: string;
}) {
  if (store.state.running) return;
  store.bootstrapped = true;
  store.logCounter = 0;
  setState({
    running: true,
    error: null,
    progress: null,
    sectionsFound: [],
    logs: [],
    result: null,
    company: opts.company,
  });
  await connect("POST", {
    company: opts.company,
    pdf: opts.pdf,
    demoRelPath: opts.demoRelPath,
    model: opts.model,
  });
}

/**
 * Tell the server to kill the running Python process. We do NOT abort the
 * local fetch here — the still-open stream will receive the final `exit`
 * event, which flips `running` to false naturally and lets the UI render the
 * stop transition gracefully.
 */
export async function cancelAnalysis() {
  try {
    await fetch("/api/ai/non-financial", {
      method: "DELETE",
      cache: "no-store",
    });
  } catch {
    // ignore - the exit event will arrive via the active stream.
  }
}
