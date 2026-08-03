import { NextRequest } from "next/server";
import {
  proxyToBackend,
  shouldProxyPythonToBackend,
} from "@/lib/backend-proxy";
import { ChildProcess, spawn } from "node:child_process";
import path from "node:path";

function killChildTree(child: ChildProcess) {
  if (!child || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      return;
    } catch {
      /* fall through to signal kill */
    }
  }
  try {
    child.kill("SIGTERM");
  } catch {}
  setTimeout(() => {
    try {
      if (!child.killed) child.kill("SIGKILL");
    } catch {}
  }, 2000);
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EmitFn = (line: string) => void;

type JobState = {
  active: boolean;
  child: ChildProcess | null;
  history: string[];
  subscribers: Set<EmitFn>;
};

const g = globalThis as unknown as { __liveDownloadState?: JobState };
if (!g.__liveDownloadState) {
  g.__liveDownloadState = {
    active: false,
    child: null,
    history: [],
    subscribers: new Set(),
  };
}
const state = g.__liveDownloadState!;

const END_SENTINEL = "__END__";

function broadcast(line: string) {
  state.history.push(line);
  if (state.history.length > 5000) {
    state.history.splice(0, state.history.length - 5000);
  }
  for (const sub of state.subscribers) {
    try {
      sub(line);
    } catch {}
  }
}

function getScriptDir() {
  const fromEnv = process.env.SCRIPT_DIR;
  if (fromEnv && fromEnv.trim().length > 0) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), "..", "backend", "scripts");
}

function pythonCommand() {
  if (process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim().length > 0) {
    return process.env.PYTHON_BIN.trim();
  }
  return process.platform === "win32" ? "python" : "python3";
}

function finalize(code: number) {
  if (!state.active && state.subscribers.size === 0) return;
  if (state.active) broadcast(JSON.stringify({ type: "exit", code }));
  state.active = false;
  state.child = null;
  const subs = Array.from(state.subscribers);
  state.subscribers.clear();
  for (const sub of subs) {
    try {
      sub(END_SENTINEL);
    } catch {}
  }
  state.history = [];
}

function attachStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let removed = false;
      const send: EmitFn = (line) => {
        if (removed) return;
        if (line === END_SENTINEL) {
          removed = true;
          state.subscribers.delete(send);
          try {
            controller.close();
          } catch {}
          return;
        }
        try {
          controller.enqueue(encoder.encode(line + "\n"));
        } catch {
          removed = true;
          state.subscribers.delete(send);
        }
      };
      if (state.active) {
        for (const line of state.history) {
          try {
            controller.enqueue(encoder.encode(line + "\n"));
          } catch {
            return;
          }
        }
        state.subscribers.add(send);
      } else {
        try {
          controller.close();
        } catch {}
      }
    },
  });
}

function streamingResponse() {
  return new Response(attachStream(), {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function startDownload(body: Record<string, unknown>) {
  if (state.active) return;
  state.active = true;
  state.history = [];

  const scriptDir = getScriptDir();
  const scriptPath = path.join(scriptDir, "Selected_report_extractor.py");
  const python = pythonCommand();
  const args = ["-u", scriptPath, "--items-stdin"];
  if (body.dryRun === true) args.push("--dry-run");

  let child: ChildProcess;
  try {
    child = spawn(python, args, {
      cwd: scriptDir,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const payload = JSON.stringify(body);
    child.stdin?.write(payload, "utf-8", () => child.stdin?.end());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    broadcast(JSON.stringify({ type: "error", message: msg }));
    finalize(1);
    return;
  }
  state.child = child;

  let stdoutBuf = "";
  let stderrBuf = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutBuf += chunk.toString("utf8");
    let nl = stdoutBuf.indexOf("\n");
    while (nl !== -1) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (line.length > 0) broadcast(line);
      nl = stdoutBuf.indexOf("\n");
    }
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString("utf8");
    let nl = stderrBuf.indexOf("\n");
    while (nl !== -1) {
      const line = stderrBuf.slice(0, nl).trim();
      stderrBuf = stderrBuf.slice(nl + 1);
      if (line.length > 0) {
        broadcast(JSON.stringify({ type: "log", level: "stderr", message: line }));
      }
      nl = stderrBuf.indexOf("\n");
    }
  });
  child.on("error", (err) => {
    broadcast(JSON.stringify({ type: "error", message: err.message }));
    finalize(1);
  });
  child.on("close", (code) => {
    if (stdoutBuf.trim()) broadcast(stdoutBuf.trim());
    finalize(code ?? 0);
  });
}

export async function POST(request: NextRequest) {
  if (shouldProxyPythonToBackend()) {
    return proxyToBackend(request, "/api/system/live-extraction/download");
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (state.active) return streamingResponse();
  const hasBatch = Array.isArray(body.items) && body.items.length > 0;
  const hasSingle = typeof body.company === "string" && Array.isArray(body.reports);
  if (!hasBatch && !hasSingle) {
    return new Response(JSON.stringify({ error: "No download selection provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  await startDownload(body);
  return streamingResponse();
}

export async function GET(request: NextRequest) {
  if (shouldProxyPythonToBackend()) {
    return proxyToBackend(request, "/api/system/live-extraction/download");
  }
  return streamingResponse();
}

export async function DELETE(request: NextRequest) {
  if (shouldProxyPythonToBackend()) {
    return proxyToBackend(request, "/api/system/live-extraction/download");
  }
  if (state.child) {
    broadcast(JSON.stringify({ type: "log", message: "Stop requested — terminating..." }));
    killChildTree(state.child);
  } else if (state.active) {
    finalize(1);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
