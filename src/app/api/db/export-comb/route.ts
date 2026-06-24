import { NextRequest, NextResponse } from "next/server";

import { fetchBackend } from "@/lib/backend-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const company = searchParams.get("company");

  if (!company?.trim()) {
    return NextResponse.json(
      { error: "Missing required query param: company" },
      { status: 400 },
    );
  }

  try {
    const qs = new URLSearchParams({ company: company.trim() });
    const res = await fetchBackend(`/db/export-comb?${qs.toString()}`);

    if (!res.ok) {
      let message = `Export failed (${res.status})`;
      try {
        const json = (await res.json()) as { error?: string; message?: string };
        message = json.error ?? json.message ?? message;
      } catch {
        /* ignore */
      }
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const disposition = res.headers.get("content-disposition");
    const filenameMatch = disposition?.match(/filename="([^"]+)"/i);
    const filename =
      filenameMatch?.[1] ?? `${company.trim()}_COMB_workbook_2022.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
