import { NextRequest, NextResponse } from "next/server";
import { ChildProcess, spawn } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function runPythonJson(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const scriptDir = getScriptDir();
    const python = pythonCommand();
    let stdout = "";
    let stderr = "";
    let child: ChildProcess;
    try {
      child = spawn(python, args, {
        cwd: scriptDir,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });
    } catch (err) {
      reject(err);
      return;
    }
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function GET(request: NextRequest) {
  const company = new URL(request.url).searchParams.get("company")?.trim();
  if (!company) {
    return NextResponse.json({ error: "company query param required" }, { status: 400 });
  }

  try {
    const scriptPath = path.join(getScriptDir(), "Selected_report_extractor.py");
    const { code, stdout, stderr } = await runPythonJson([
      "-u",
      scriptPath,
      "--list-reports",
      company,
    ]);
    const line = stdout.trim().split("\n").pop() ?? "{}";
    const payload = JSON.parse(line) as Record<string, unknown>;
    if (code !== 0 || payload.ok === false) {
      return NextResponse.json(
        {
          error: String(payload.error ?? stderr ?? "Failed to list reports"),
          ...payload,
        },
        { status: 502 },
      );
    }
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
