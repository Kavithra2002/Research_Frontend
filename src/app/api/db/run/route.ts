import { NextRequest } from "next/server";
import {
  proxyToBackend,
  shouldProxyPythonToBackend,
} from "@/lib/backend-proxy";
import { ChildProcess, spawn } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EmitFn = (line: string) => void;

type RunState = {
  active: boolean;
  child: ChildProcess | null;
  history: string[];
  subscribers: Set<EmitFn>;
};

const g = globalThis as unknown as { __dbCombRunState?: RunState };
if (!g.__dbCombRunState) {
  g.__dbCombRunState = {
    active: false,
    child: null,
    history: [],
    subscribers: new Set(),
  };
}
const state = g.__dbCombRunState!;

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
}

function sanitizeYears(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const out: number[] = [];
  for (const raw of input) {
    const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 1990 && n <= 2100) out.push(n);
  }
  return [...new Set(out)].sort((a, b) => b - a);
}

interface StartOptions {
  usePdfExtract?: boolean;
  useOpenaiNotes?: boolean;
  forceNoteCapture?: boolean;
}

async function startRun(years: number[], opts: StartOptions) {
  if (state.active) return;
  state.active = true;
  state.history = [];

  const scriptDir = getScriptDir();
  const scriptPath = path.join(scriptDir, "db_comb_run.py");
  const python = pythonCommand();

  const args: string[] = ["-u", scriptPath, "--years-stdin"];
  if (opts.usePdfExtract) args.push("--use-pdf-extract");
  if (opts.useOpenaiNotes) args.push("--use-openai-notes");
  if (opts.forceNoteCapture) args.push("--force-note-capture");

  let child: ChildProcess;
  try {
    child = spawn(python, args, {
      cwd: scriptDir,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const payload = JSON.stringify({ years });
    child.stdin?.write(payload, "utf-8", () => {
      child.stdin?.end();
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    broadcast(
      JSON.stringify({ type: "error", message: `Failed to spawn python: ${msg}` }),
    );
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
        broadcast(
          JSON.stringify({ type: "log", level: "stderr", message: line }),
        );
      }
      nl = stderrBuf.indexOf("\n");
    }
  });

  child.on("error", (err) => {
    broadcast(
      JSON.stringify({
        type: "error",
        message: `Failed to spawn python: ${err.message}`,
      }),
    );
    finalize(1);
  });

  child.on("close", (code) => {
    if (stdoutBuf.trim().length > 0) broadcast(stdoutBuf.trim());
    if (stderrBuf.trim().length > 0) {
      broadcast(
        JSON.stringify({
          type: "log",
          level: "stderr",
          message: stderrBuf.trim(),
        }),
      );
    }
    stdoutBuf = "";
    stderrBuf = "";
    finalize(code ?? 0);
  });
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

      for (const line of state.history) {
        try {
          controller.enqueue(encoder.encode(line + "\n"));
        } catch {
          return;
        }
      }

      if (state.active) {
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

export async function POST(request: NextRequest) {
  if (shouldProxyPythonToBackend()) {
    return proxyToBackend(request, "/api/db/run");
  }

  return new Response(
    JSON.stringify({
      error:
        "DB capture was moved to Development. Use Run DB Annual, Run DB Quarter, or Run DB selected all on the Test Here page.",
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

export async function GET(request: NextRequest) {
  if (shouldProxyPythonToBackend()) {
    return proxyToBackend(request, "/api/db/run");
  }
  return streamingResponse();
}

export async function DELETE(request: NextRequest) {
  if (shouldProxyPythonToBackend()) {
    return proxyToBackend(request, "/api/db/run");
  }
  if (state.child) {
    try {
      state.child.kill();
    } catch {}
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
