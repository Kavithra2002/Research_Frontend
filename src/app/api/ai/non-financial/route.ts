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

type NonFinancialState = {
  active: boolean;
  child: ChildProcess | null;
  company: string | null;
  history: string[];
  subscribers: Set<EmitFn>;
};

// Persist state across hot-reloads in dev and between requests in prod.
const g = globalThis as unknown as {
  __nonFinancialState?: NonFinancialState;
};
if (!g.__nonFinancialState) {
  g.__nonFinancialState = {
    active: false,
    child: null,
    company: null,
    history: [],
    subscribers: new Set(),
  };
}
const state = g.__nonFinancialState!;

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
  if (fromEnv && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv);
  }
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
  if (state.active) {
    broadcast(JSON.stringify({ type: "exit", code }));
  }
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

type RunOptions = {
  company: string;
  pdf?: string;
  model?: string;
  dryRun?: boolean;
};

function startRun(opts: RunOptions) {
  if (state.active) return;
  state.active = true;
  state.company = opts.company;
  state.history = [];

  const scriptDir = getScriptDir();
  const scriptPath = path.join(scriptDir, "non_financial_script.py");
  const python = pythonCommand();

  const args: string[] = [
    "-u",
    scriptPath,
    "--company",
    opts.company,
  ];
  if (opts.pdf && opts.pdf.trim().length > 0) {
    args.push("--pdf", opts.pdf.trim());
  }
  if (opts.model && opts.model.trim().length > 0) {
    args.push("--model", opts.model.trim());
  }
  if (opts.dryRun) {
    args.push("--dry-run");
  }

  let child: ChildProcess;
  try {
    child = spawn(python, args, {
      cwd: scriptDir,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
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
    return proxyToBackend(request, "/api/ai/non-financial");
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (state.active) {
    // Already running — just re-attach the caller to the existing stream.
    return streamingResponse();
  }

  const company =
    typeof body.company === "string" ? body.company.trim() : "";
  if (!company) {
    return new Response(
      JSON.stringify({ error: "Missing required field: company" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  startRun({
    company,
    pdf: typeof body.pdf === "string" ? body.pdf : undefined,
    model: typeof body.model === "string" ? body.model : undefined,
    dryRun: body.dryRun === true,
  });

  return streamingResponse();
}

export async function GET(request: NextRequest) {
  if (shouldProxyPythonToBackend()) {
    return proxyToBackend(request, "/api/ai/non-financial");
  }
  return streamingResponse();
}

export async function DELETE(request: NextRequest) {
  if (shouldProxyPythonToBackend()) {
    return proxyToBackend(request, "/api/ai/non-financial");
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
