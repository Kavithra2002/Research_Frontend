import { NextRequest } from "next/server";
import { ChildProcess, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type EmitFn = (line: string) => void;

interface SelectionItem {
  company: string;
  report_type: string;
  file_name: string;
}

type UpdateState = {
  active: boolean;
  child: ChildProcess | null;
  itemsTempFile: string | null;
  history: string[];
  subscribers: Set<EmitFn>;
};

// Persist state across hot-reloads in dev and across requests in prod.
const g = globalThis as unknown as { __extractUpdateState?: UpdateState };
if (!g.__extractUpdateState) {
  g.__extractUpdateState = {
    active: false,
    child: null,
    itemsTempFile: null,
    history: [],
    subscribers: new Set(),
  };
}
const state = g.__extractUpdateState!;

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
  return path.resolve(process.cwd(), "..", "backend");
}

function pythonCommand() {
  if (process.env.PYTHON_BIN && process.env.PYTHON_BIN.trim().length > 0) {
    return process.env.PYTHON_BIN.trim();
  }
  return process.platform === "win32" ? "python" : "python3";
}

function cleanupItemsFile() {
  const file = state.itemsTempFile;
  if (!file) return;
  state.itemsTempFile = null;
  fs.rm(path.dirname(file), { recursive: true, force: true }).catch(() => {});
}

function finalize(code: number) {
  if (!state.active && state.subscribers.size === 0) return;
  if (state.active) {
    broadcast(JSON.stringify({ type: "exit", code }));
  }
  state.active = false;
  state.child = null;
  cleanupItemsFile();
  const subs = Array.from(state.subscribers);
  state.subscribers.clear();
  for (const sub of subs) {
    try {
      sub(END_SENTINEL);
    } catch {}
  }
}

function sanitizeItems(input: unknown): SelectionItem[] {
  if (!Array.isArray(input)) return [];
  const out: SelectionItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const company = typeof o.company === "string" ? o.company.trim() : "";
    const report_type =
      typeof o.report_type === "string" ? o.report_type.trim() : "";
    const file_name =
      typeof o.file_name === "string" ? o.file_name.trim() : "";
    if (!company || !report_type || !file_name) continue;
    out.push({ company, report_type, file_name });
  }
  return out;
}

async function writeItemsTempFile(items: SelectionItem[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ambeon-update-"));
  const file = path.join(dir, "items.json");
  await fs.writeFile(file, JSON.stringify({ items }, null, 2), "utf-8");
  return file;
}

interface StartUpdateOptions {
  dryRun?: boolean;
  option?: "1" | "2";
  model?: string;
}

async function startUpdate(
  items: SelectionItem[],
  opts: StartUpdateOptions,
) {
  if (state.active) return;
  state.active = true;
  state.history = [];

  const scriptDir = getScriptDir();
  const scriptPath = path.join(scriptDir, "Extract_selected_reports.py");
  const python = pythonCommand();

  let itemsFile: string;
  try {
    itemsFile = await writeItemsTempFile(items);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    broadcast(
      JSON.stringify({
        type: "error",
        message: `Failed to stage selection file: ${msg}`,
      }),
    );
    finalize(1);
    return;
  }
  state.itemsTempFile = itemsFile;

  const args: string[] = ["-u", scriptPath, "--items", itemsFile];
  if (opts.option) args.push("--option", opts.option);
  if (opts.model) args.push("--model", opts.model);
  if (opts.dryRun) args.push("--dry-run");

  let child: ChildProcess;
  try {
    child = spawn(python, args, {
      cwd: scriptDir,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    broadcast(
      JSON.stringify({
        type: "error",
        message: `Failed to spawn python: ${msg}`,
      }),
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

      // Replay history so new subscribers can rebuild current state.
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
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  if (state.active) {
    // An update is already running — just re-attach the caller to the
    // existing stream rather than starting another one.
    return streamingResponse();
  }

  const items = sanitizeItems(body.items);
  if (items.length === 0) {
    return new Response(
      JSON.stringify({ error: "No selected items provided" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const opts: StartUpdateOptions = {
    dryRun: body.dryRun === true,
    option: body.option === "2" ? "2" : "1",
    model: typeof body.model === "string" ? body.model : undefined,
  };

  await startUpdate(items, opts);

  return streamingResponse();
}

export async function GET() {
  return streamingResponse();
}

export async function DELETE() {
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
