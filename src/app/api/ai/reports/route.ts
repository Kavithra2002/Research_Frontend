import { NextResponse } from "next/server";

import { listStoredReports, saveStoredReport } from "@/lib/gen-reports-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agent = searchParams.get("agent")?.trim() || undefined;
  try {
    const reports = await listStoredReports(agent);
    return NextResponse.json({ reports });
  } catch (e) {
    return NextResponse.json(
      { reports: [], error: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = (body ?? {}) as Record<string, unknown>;
  const agent = typeof data.agent === "string" ? data.agent.trim() : "";
  const content = typeof data.content === "string" ? data.content : "";

  if (!agent) {
    return NextResponse.json({ error: "agent is required" }, { status: 400 });
  }
  if (!content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  try {
    const report = await saveStoredReport({
      agent,
      content,
      title: typeof data.title === "string" ? data.title : undefined,
      companies: Array.isArray(data.companies)
        ? (data.companies as unknown[]).map(String)
        : undefined,
      metrics: Array.isArray(data.metrics)
        ? (data.metrics as unknown[]).map(String)
        : undefined,
    });
    return NextResponse.json({ report });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
